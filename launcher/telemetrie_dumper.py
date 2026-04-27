"""
LMU Telemetry Dumper — Background Thread
=========================================
Lit la mémoire partagée de Le Mans Ultimate (rFactor2 engine) et écrit
telemetrie.json dans htdocs/ à 20 fps.

Lancé automatiquement par launcher.py sous forme de thread daemon.
S'arrête proprement quand l'application quitte.
"""
import json
import logging
import os
import re
import threading
import time
from collections import defaultdict
from pathlib import Path

log = logging.getLogger(__name__)

# rF2data.py est copié dans le même dossier (pas de dépendance pip)
try:
    from rF2data import SimInfo
    _RF2DATA_OK = True
except Exception as _import_err:
    SimInfo = None
    _RF2DATA_OK = False
    log.warning(f"rF2data non disponible : {_import_err}")

# ── État du thread ────────────────────────────────────────────────────────────

_stop_event: threading.Event = threading.Event()
_thread: threading.Thread | None = None

# ── Cache circuit (accumulé sur la durée de la session) ───────────────────────
# Clé = bucket lapDist (résolution 20 m) → valeur = [x, z]
_track_pts:         dict = {}   # bucket → [avg_x, avg_z]
_track_counts:      dict = {}   # bucket → nombre de passages enregistrés
_track_key:         str  = ""   # "trackName_sessionType" pour détecter un changement de circuit
_track_saved_count: int  = 0    # Nombre de points lors de la dernière sauvegarde

_TRACK_MAX_PASSES = 2           # Nombre de passages à moyenner pour chaque bucket

# ── Cache statique GeoJSON / live ─────────────────────────────────────────────
_static_points_cache = {}
_CIRCUITS_DIR = None

# ── Correspondances nom LMU → nom de fichier (partagé entre load et save) ─────
_CIRCUIT_ALIASES = {
    "Autodromo Nazionale Monza":    "monza",
    "Autodromo Nazionale di Monza": "monza",
    "Monza":                        "monza",
}

# ── État joueur (réinitialisé à chaque reconnexion) ──────────────────────────

def _new_player_state() -> dict:
    return {
        "last_lap_num": 0,
        "fuel_at_lap_start": 0.0,
        "lap_fuel_history": [],
        "best_s1": 0.0,
        "best_s2": 0.0,
        "best_s3": 0.0,
    }

# ── Helpers ───────────────────────────────────────────────────────────────────

def _clean(s) -> str:
    return bytes(s).partition(b"\0")[0].decode("utf-8", errors="ignore").strip()


_KNOWN_MODELS = [
    # === HYPERCARS (WEC) ===
    "Alpine A424", 
    "Aston Martin Valkyrie", 
    "BMW M Hybrid", 
    "Cadillac V-Series.R", 
    "Ferrari 499P", 
    "Genesis", 
    "Glickenhaus", 
    "Isotta", 
    "Lamborghini SC63", 
    "Peugeot 9X8", 
    "Porsche 963", 
    "Toyota GR010", 
    "Vanwall",
    
    # === LMP2 ===
    "Oreca 07",
    
    # === LMP3 ===
    "Duqueine", 
    "Ginetta", 
    "Ligier",

    # === LMGT3 / GTE ===
    "Aston Martin Vantage", "BMW M4", "Corvette C8", "Corvette Z06",
    "Ferrari 296", "Ferrari 488", "Ford Mustang", "Lamborghini Huracan",
    "Lexus RCF", "McLaren 720S", "Mercedes-AMG", "Porsche 911 GT3", "Porsche 911 RSR"
]

def _car_model(full_name: str) -> str:
    for model in _KNOWN_MODELS:
        if model.lower() in full_name.lower():
            return model
    m = re.search(r'^\S+\s\S+', full_name.replace("_", " "))
    return m.group(0) if m else full_name


# ── Chargement GeoJSON ────────────────────────────────────────────────────────

def _circuit_base_name(circuit_name: str) -> str:
    """Retourne le nom de fichier de base pour un circuit (sans extension)."""
    base = _CIRCUIT_ALIASES.get(circuit_name)
    if base:
        return base
    return re.sub(r'[^a-z0-9]+', '_', circuit_name.lower()).strip('_')


def _load_geojson_track(circuit_name: str) -> list | None:
    """Charge les points de circuit depuis un fichier _live.json ou GeoJSON.

    Priorité :
      1. {base}_live.json  — données accumulées par le dumper (sessions précédentes)
      2. {base}.geojson    — tracé manuel fourni par l'utilisateur
      3. {base}.json       — idem format JSON
    Retourne une liste de [x, z] ou None.
    """
    if not _CIRCUITS_DIR:
        return None

    base_name = _circuit_base_name(circuit_name)

    # 1. Cache live (généré par ce dumper lors des sessions précédentes)
    live_path = _CIRCUITS_DIR / f"{base_name}_live.json"
    if live_path.exists():
        try:
            with open(live_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            pts = data.get("points", [])
            if len(pts) >= 30:
                points = [[p["x"], p["z"]] for p in pts]
                log.info(f"Cache live chargé : {live_path.name} ({len(points)} pts)")
                return points
        except Exception as e:
            log.warning(f"Erreur lecture cache live {live_path} : {e}")

    # 2 & 3. GeoJSON / JSON statique fourni manuellement
    for ext in (".geojson", ".json"):
        static_path = _CIRCUITS_DIR / f"{base_name}{ext}"
        if not static_path.exists():
            continue
        try:
            with open(static_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if data.get("type") == "FeatureCollection":
                for feature in data.get("features", []):
                    geom = feature.get("geometry")
                    if geom and geom.get("type") == "LineString":
                        coords = geom.get("coordinates", [])
                        points = [[c[0], c[1]] for c in coords if len(c) >= 2]
                        if points:
                            log.info(f"GeoJSON chargé : {static_path.name} ({len(points)} pts)")
                            return points
            elif data.get("type") == "LineString":
                coords = data.get("coordinates", [])
                points = [[c[0], c[1]] for c in coords]
                if points:
                    log.info(f"GeoJSON direct : {static_path.name} ({len(points)} pts)")
                    return points
        except Exception as e:
            log.warning(f"Erreur lecture GeoJSON {static_path} : {e}")

    return None


def _save_track_points(track_name: str) -> None:
    """Sauvegarde les points accumulés dans circuits/{base}_live.json.

    N'écrit que si au moins 20 nouveaux points ont été ajoutés depuis la
    dernière sauvegarde et qu'on dépasse le minimum de 30 points.
    """
    global _track_saved_count
    if not _CIRCUITS_DIR:
        return
    n = len(_track_pts)
    if n < 30 or n <= _track_saved_count + 20:
        return   # Pas encore assez ou pas assez de nouveautés

    base = _circuit_base_name(track_name)
    save_path = _CIRCUITS_DIR / f"{base}_live.json"
    sorted_pts = [_track_pts[k] for k in sorted(_track_pts.keys())]
    payload = {"points": [{"x": p[0], "z": p[1]} for p in sorted_pts]}
    try:
        tmp = str(save_path) + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(payload, f, separators=(',', ':'))
        os.replace(tmp, str(save_path))
        _track_saved_count = n
        # Mise à jour du cache in-memory pour la session courante
        _static_points_cache[track_name] = sorted_pts
        log.info(f"Circuit sauvegardé : {save_path.name} ({n} pts)")
    except Exception as e:
        log.warning(f"Erreur sauvegarde circuit {save_path} : {e}")


# ── Snapshot ──────────────────────────────────────────────────────────────────

def _snapshot(info, ps: dict) -> dict | None:
    global _track_pts, _track_counts, _track_key, _track_saved_count

    scor_info = info.Rf2Scor.mScoringInfo
    n = scor_info.mNumVehicles
    if n == 0:
        return None
    # Ne pas émettre si le jeu n'est pas en session active
    if scor_info.mCurrentET <= 0:
        return None

    # Réinitialiser le cache si le circuit ou le type de session change
    session_key = f"{_clean(scor_info.mTrackName)}_{scor_info.mSession}"
    if session_key != _track_key:
        _track_pts         = {}
        _track_counts      = {}
        _track_key         = session_key
        _track_saved_count = 0

    # Trouver le joueur dans le scoring
    player_scor = None
    player_id   = -1
    for i in range(n):
        v = info.Rf2Scor.mVehicles[i]
        if v.mIsPlayer:
            player_scor = v
            player_id   = v.mID
            break
    if player_scor is None:
        return None

    # Trouver la télémétrie du joueur
    player_tele = None
    for i in range(n):
        t = info.Rf2Tele.mVehicles[i]
        if t.mID == player_id:
            player_tele = t
            break
    if player_tele is None:
        return None

    # ── Consommation carburant ────────────────────────────────────────────────
    current_lap = player_tele.mLapNumber
    if current_lap > ps["last_lap_num"] and ps["fuel_at_lap_start"] > 0:
        used = ps["fuel_at_lap_start"] - player_tele.mFuel
        if 0.5 < used < 10.0:
            ps["lap_fuel_history"].append(used)
            if len(ps["lap_fuel_history"]) > 5:
                ps["lap_fuel_history"].pop(0)
    ps["last_lap_num"] = current_lap
    if player_scor.mInPits == 0:
        ps["fuel_at_lap_start"] = player_tele.mFuel

    avg_conso = (
        sum(ps["lap_fuel_history"]) / len(ps["lap_fuel_history"])
        if ps["lap_fuel_history"] else 0.0
    )
    laps_left = (player_tele.mFuel / avg_conso) if avg_conso > 0 else 0.0

    # ── Télémétrie ────────────────────────────────────────────────────────────
    speed_kmh  = abs(player_tele.mLocalVel.z) * 3.6
    track_temp = scor_info.mTrackTemp

    wheels = []
    for w in player_tele.mWheels:
        bt = w.mBrakeTemp
        if speed_kmh < 1 and bt > (track_temp + 50):
            bt = -1  # valeur invalide à l'arrêt
        wheels.append({
            "temp":      w.mTireCarcassTemperature - 273.15,
            "wear":      (1.0 - w.mWear) * 100,
            "brakeTemp": bt,
            "pressure":  w.mPressure,
        })

    telem = {
        "gear":             player_tele.mGear,
        "rpm":              player_tele.mEngineRPM,
        "speed_kmh":        speed_kmh,
        "throttle":         player_tele.mUnfilteredThrottle,
        "brake":            player_tele.mUnfilteredBrake,
        "steering":         player_tele.mUnfilteredSteering,
        "fuel":             player_tele.mFuel,
        "fuelCapacity":     player_tele.mFuelCapacity,
        "fuelConsumption":  avg_conso,
        "fuelLapsRemaining":laps_left,
        "lap":              current_lap,
        "lapTime":          player_tele.mElapsedTime - player_tele.mLapStartET,
        "mEngineMaxRPM":    player_tele.mEngineMaxRPM,
        "engineWaterTemp":  player_tele.mEngineWaterTemp,
        "engineOilTemp":    player_tele.mEngineOilTemp,
        "wheels":           wheels,
        "damage": {
            "total": sum(player_tele.mDentSeverity) / 16.0 * 100,
            "zones": list(player_tele.mDentSeverity),
        },
    }

    # ── Secteurs joueur ───────────────────────────────────────────────────────
    s1 = player_scor.mLastSector1
    s2 = (
        player_scor.mLastSector2 - player_scor.mLastSector1
        if player_scor.mLastSector2 > 0 and player_scor.mLastSector1 > 0 else 0.0
    )
    s3 = (
        player_scor.mLastLapTime - player_scor.mLastSector2
        if player_scor.mLastLapTime > 0 and player_scor.mLastSector2 > 0 else 0.0
    )

    # Meilleurs secteurs personnels (réinitialisés si pas de best lap)
    if player_scor.mBestLapTime <= 0:
        ps["best_s1"] = ps["best_s2"] = ps["best_s3"] = 0.0
    else:
        if current_lap > ps["last_lap_num"]:
            if 0 < s1 < (ps["best_s1"] or 999):
                ps["best_s1"] = s1
            if 0 < s2 < (ps["best_s2"] or 999):
                ps["best_s2"] = s2
            if 0 < s3 < (ps["best_s3"] or 999):
                ps["best_s3"] = s3

    est = player_scor.mEstimatedLapTime
    best = player_scor.mBestLapTime
    lap_delta = (est - best) if est > 0 and best > 0 and player_scor.mInPits == 0 else 0.0

    scoring = {
        "driver":      _clean(player_scor.mDriverName),
        "vehicle":     _car_model(_clean(player_scor.mVehicleName)),
        "position":    player_scor.mPlace,
        "lastLapTime": player_scor.mLastLapTime,
        "bestLapTime": player_scor.mBestLapTime,
        "playerFlag":  player_scor.mFlag,
        "lastSectors": [s1, s2, s3],
        "bestSectors": [ps["best_s1"], ps["best_s2"], ps["best_s3"]],
        "lapDelta":    lap_delta,
    }

    session = {
        "track":       _clean(scor_info.mTrackName),
        "sessionTime": scor_info.mCurrentET,
        "maxLaps":     scor_info.mMaxLaps,
        "numVehicles": n,
    }
    flags = {
        "gamePhase":      scor_info.mGamePhase,
        "yellowFlagState":scor_info.mYellowFlagState,
        "sectorFlags":    list(scor_info.mSectorFlag),
    }
    weather = {
        "airTemp":   scor_info.mAmbientTemp,
        "trackTemp": scor_info.mTrackTemp,
        "windSpeed": (scor_info.mWind.x**2 + scor_info.mWind.y**2 + scor_info.mWind.z**2)**0.5 * 3.6,
        "rain":      scor_info.mRaining,
    }

    # ── Classement complet ────────────────────────────────────────────────────
    standings  = []
    track_layout = {"minX": float("inf"), "maxX": float("-inf"),
                    "minZ": float("inf"), "maxZ": float("-inf")}

    for i in range(n):
        v = info.Rf2Scor.mVehicles[i]
        if v.mPlace == 0:
            continue
        vs1 = v.mLastSector1
        vs2 = v.mLastSector2 - v.mLastSector1 if v.mLastSector2 > 0 else 0.0
        vs3 = v.mLastLapTime - v.mLastSector2 if v.mLastLapTime > 0 and v.mLastSector2 > 0 else 0.0
        standings.append({
            "position":         v.mPlace,
            "driver":           _clean(v.mDriverName),
            "vehicleName":      _car_model(_clean(v.mVehicleName)),
            "vehicleClass":     _clean(v.mVehicleClass),
            "lastLapTime":      v.mLastLapTime,
            "bestLapTime":      v.mBestLapTime,
            "timeBehindLeader": v.mTimeBehindLeader,
            "lapsBehindLeader": v.mLapsBehindLeader,
            "isPlayer":         v.mIsPlayer,
            "inPits":           v.mInPits,
            "currentSector":    v.mSector,
            "lastS1": vs1, "lastS2": vs2, "lastS3": vs3,
            "pos": {"x": v.mPos.x, "z": v.mPos.z},
        })
        track_layout["minX"] = min(track_layout["minX"], v.mPos.x)
        track_layout["maxX"] = max(track_layout["maxX"], v.mPos.x)
        track_layout["minZ"] = min(track_layout["minZ"], v.mPos.z)
        track_layout["maxZ"] = max(track_layout["maxZ"], v.mPos.z)

        # Accumuler la position dans le cache circuit (résolution 20 m)
        # — Ignorer les voitures aux stands (évite de tracer la voie des stands)
        # — Moyenne sur _TRACK_MAX_PASSES passages pour corriger les positions parasites
        lap_dist = v.mLapDist
        if lap_dist > 0 and v.mInPits == 0:
            bucket = int(lap_dist / 20)
            n = _track_counts.get(bucket, 0)
            if n < _TRACK_MAX_PASSES:
                x, z = v.mPos.x, v.mPos.z
                if n == 0:
                    _track_pts[bucket] = [x, z]
                else:
                    # Moyenne glissante : lisse les positions entre les passages
                    old = _track_pts[bucket]
                    _track_pts[bucket] = [(old[0] * n + x) / (n + 1),
                                          (old[1] * n + z) / (n + 1)]
                _track_counts[bucket] = n + 1

    # ── Points du circuit : priorité au GeoJSON statique ──────────────────────
    track_name = _clean(scor_info.mTrackName)

    # Sauvegarder le tracé accumulé si on a assez de nouveaux points
    _save_track_points(track_name)
    if track_name not in _static_points_cache:
        _static_points_cache[track_name] = _load_geojson_track(track_name)

    if _static_points_cache[track_name]:
        track_points = _static_points_cache[track_name]
    else:
        track_points = [_track_pts[k] for k in sorted(_track_pts.keys())] if _track_pts else []

    # Positions par classe + best-in-class
    by_class: dict = defaultdict(list)
    for d in standings:
        by_class[d["vehicleClass"]].append(d)

    for cls_drivers in by_class.values():
        cls_drivers.sort(key=lambda d: d["position"])
        for idx, d in enumerate(cls_drivers):
            d["classPosition"] = idx + 1
        bl = min((d["bestLapTime"] for d in cls_drivers if d["bestLapTime"] > 0), default=0.0)
        bs1 = min((d["lastS1"]     for d in cls_drivers if d["lastS1"]     > 0), default=0.0)
        bs2 = min((d["lastS2"]     for d in cls_drivers if d["lastS2"]     > 0), default=0.0)
        bs3 = min((d["lastS3"]     for d in cls_drivers if d["lastS3"]     > 0), default=0.0)
        for d in cls_drivers:
            d["isClassBestLap"] = d["bestLapTime"] == bl  and bl  > 0
            d["isClassBestS1"]  = d["lastS1"]     == bs1 and bs1 > 0
            d["isClassBestS2"]  = d["lastS2"]     == bs2 and bs2 > 0
            d["isClassBestS3"]  = d["lastS3"]     == bs3 and bs3 > 0

    return {
        "telemetry":   telem,
        "scoring":     scoring,
        "session":     session,
        "standings":   standings,
        "weather":     weather,
        "flags":       flags,
        "trackLayout": track_layout,
        "trackPoints": track_points,
        "sessionId":   scor_info.mSession,
        "_ts":         time.time(),
    }


# ── Thread principal ──────────────────────────────────────────────────────────

def _run(htdocs_dir: Path) -> None:
    outfile = htdocs_dir / "telemetrie.json"
    log.info("Telemetry dumper : thread démarré.")

    # Supprimer tout fichier résiduel d'une session précédente
    try:
        outfile.unlink(missing_ok=True)
        log.info("Telemetry dumper : fichier JSON résiduel supprimé.")
    except Exception:
        pass

    while not _stop_event.is_set():
        try:
            info = SimInfo()
            ps   = _new_player_state()
            log.info("Telemetry dumper : connecté à la mémoire partagée LMU.")

            while not _stop_event.is_set():
                try:
                    data = _snapshot(info, ps)
                    if data:
                        tmp = str(outfile) + ".tmp"
                        with open(tmp, "w", encoding="utf-8") as f:
                            json.dump(data, f)
                        try:
                            os.replace(tmp, str(outfile))
                        except PermissionError:
                            pass
                except Exception as e:
                    log.debug(f"Erreur snapshot : {e}")
                _stop_event.wait(0.05)   # 20 fps

        except Exception as e:
            # LMU non lancé → réessayer dans 2 s
            log.debug(f"Mémoire partagée indisponible : {e}")
            _stop_event.wait(2.0)

    # Nettoyage : supprimer le fichier JSON à l'arrêt
    try:
        outfile.unlink(missing_ok=True)
    except Exception:
        pass
    log.info("Telemetry dumper : thread arrêté.")


# ── API publique ──────────────────────────────────────────────────────────────

def start(htdocs_dir: Path, circuits_dir: Path = None) -> None:
    """Démarre le thread de dump télémétrie (idempotent)."""
    global _thread, _CIRCUITS_DIR
    if not _RF2DATA_OK:
        log.warning("Telemetry dumper désactivé (rF2data non disponible).")
        return
    if circuits_dir is None:
        circuits_dir = htdocs_dir / "circuits"
    _CIRCUITS_DIR = circuits_dir
    _stop_event.clear()
    _thread = threading.Thread(
        target=_run, args=(htdocs_dir,),
        daemon=True, name="TelemetryDumper",
    )
    _thread.start()
    log.info("Telemetry dumper : thread lancé.")


def stop() -> None:
    """Arrête proprement le thread."""
    _stop_event.set()
    if _thread and _thread.is_alive():
        _thread.join(timeout=2.0)
    log.info("Telemetry dumper : stop() appelé.")