/**
 * Suite « pipeline coach » (COACH-LIVE-SPEC.md §14.2/§14.3/§14.4) :
 *  - **Diagnostics** : mesures synthétiques → `diagnoseCorner` → un diagnostic
 *    précis (et un seul), calibration + confirmation, inhibiteurs, sous-seuil muet.
 *  - **Rejeu moteur** : tours de frames synthétiques → `stepCoach` → détection de
 *    virages + mesures avec réf ; **property tests** (bruit, frames dupliquées, shift)
 *    → détection inchangée.
 */

import { section, ok, eq } from "../assert";
import { createDiagState, diagnoseCorner } from "../../diagnostics";
import { synthMeasurement, synthSession, noiseSpeed, duplicateFrames, shiftByOne } from "../synth";
import { replayEngine, refFromLapFrames } from "../replay";
import { serializeFramesJsonl, parseFramesJsonl } from "../record";

export function run(): void {
  // ── Diagnostics (§14.3) : un décalage franc → un diagnostic précis ──
  section("diagnostics.brakeTiming");
  {
    const st = createDiagState();
    const cfg = { level: "fast" as const, calibrationLaps: 5 };
    // Mesure alignée sur la réf → jamais de diagnostic (calibration OK).
    ok(diagnoseCorner(synthMeasurement(), st, cfg).kind === "none", "aligned → none");
    ok(diagnoseCorner(synthMeasurement(), st, cfg).kind === "none", "aligned ×2 → none");

    // Décalage franc et constant du point de freinage (+20 m) → confirmé au 2ᵉ passage.
    const st2 = createDiagState();
    const late = () => synthMeasurement({ brakeDist: 320 }); // réf = 300
    const r1 = diagnoseCorner(late(), st2, cfg);
    ok(r1.kind === "none", "1er passage décalé → confirmation en attente");
    const r2 = diagnoseCorner(late(), st2, cfg);
    ok(r2.kind === "diagnostic" && r2.diag.code === "brake-timing", "2ᵉ passage → brake-timing");
  }

  section("diagnostics.calibration");
  {
    const st = createDiagState();
    // Avant 3 tours valides : aucun message même avec un gros écart (§7).
    const r = diagnoseCorner(synthMeasurement({ brakeDist: 340 }), st, { level: "fast", calibrationLaps: 1 });
    ok(r.kind === "none", "calibration < 3 → none");
  }

  section("diagnostics.mute");
  {
    const st = createDiagState();
    const cfg = { level: "fast" as const, calibrationLaps: 5 };
    // Trafic devant à l'entrée → virage muet (§6), pas de diagnostic malgré l'écart.
    const m = synthMeasurement({ brakeDist: 340, ctx: { ...synthMeasurement().ctx, gapAheadEntry: 0.5 } });
    ok(diagnoseCorner(m, st, cfg).kind === "muted", "traffic-ahead → muted");
    // Fenêtre taintée → muet.
    ok(diagnoseCorner(synthMeasurement({ tainted: true }), st, cfg).kind === "muted", "tainted → muted");
    // Sans réf → muet (no-ref).
    ok(diagnoseCorner(synthMeasurement({ hasRef: false }), st, cfg).kind === "muted", "no-ref → muted");
  }

  section("diagnostics.underThreshold");
  {
    const st = createDiagState();
    const cfg = { level: "fast" as const, calibrationLaps: 5 };
    // Écart de 2 m < plancher (5 m niveau fast) → aucun diagnostic, même répété.
    for (let i = 0; i < 4; i++) {
      ok(diagnoseCorner(synthMeasurement({ brakeDist: 302 }), st, cfg).kind === "none", "small offset → none");
    }
  }

  // ── Rejeu moteur (§14.2) : détection de virages sur un tour synthétique ──
  section("engine.detection");
  {
    const frames = synthSession(3);
    const { laps } = replayEngine(frames);
    const withCorners = laps.filter((l) => l.corners.length >= 2);
    ok(laps.length >= 2, "≥2 tours bouclés (3 tours générés)");
    ok(withCorners.length >= 1, "≥1 tour avec ≥2 virages détectés");
  }

  section("engine.measurementsWithRef");
  {
    const frames = synthSession(3);
    const ref = refFromLapFrames(frames);
    ok(ref !== null && ref.corners.length >= 2, "réf ghost construite (≥2 virages)");
    const { measurements } = replayEngine(frames, ref);
    ok(measurements.length >= 1, "≥1 mesure de virage avec réf");
    ok(measurements.every((m) => m.hasRef), "toutes les mesures portent la réf");
  }

  // ── Property tests (§14.4) : robustesse au bruit / frames parasites ──
  section("engine.robustness");
  {
    const base = synthSession(3);
    const baseCorners = replayEngine(base).laps.filter((l) => l.corners.length >= 2).length;
    ok(baseCorners >= 1, "baseline détecte des virages");

    const noisy = replayEngine(noiseSpeed(base, 0.5)).laps.filter((l) => l.corners.length >= 2).length;
    ok(noisy >= 1, "bruit σ=0.5 km/h → détection conservée");

    const duped = replayEngine(duplicateFrames(base)).laps.filter((l) => l.corners.length >= 2).length;
    ok(duped >= 1, "frames dupliquées → détection conservée (dist strictement croissante)");

    const shifted = replayEngine(shiftByOne(base)).laps.filter((l) => l.corners.length >= 2).length;
    ok(shifted >= 1, "shift ±1 frame → détection conservée");
  }

  // ── Enregistreur JSONL (§14.1) : round-trip enregistrer → parser → rejouer ──
  section("record.roundtrip");
  {
    const frames = synthSession(3);
    const jsonl = serializeFramesJsonl(frames);
    const parsed = parseFramesJsonl(jsonl);
    eq(parsed.length, frames.length, "toutes les frames récupérées");
    const a = replayEngine(frames).laps.filter((l) => l.corners.length >= 2).length;
    const b = replayEngine(parsed).laps.filter((l) => l.corners.length >= 2).length;
    eq(a, b, "rejeu identique après sérialisation JSONL");
    eq(parseFramesJsonl("").length, 0, "corpus vide → 0 frame");
  }
}
