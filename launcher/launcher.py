"""
LMU Stats Viewer — Launcher
============================
Lance le serveur PHP en arrière-plan et gère l'icône dans la barre système.
Double-clic sur l'icône → ouvre le navigateur.
Clic droit → menu (Ouvrir / Config / Mises à jour / Quitter).

Compilation :
    pyinstaller --onefile --windowed --name LMU_Stats_Viewer
                --icon ../htdocs/logos/lmu.ico
                --add-data "../htdocs/logos/lmu.ico;."
                launcher.py
"""

import ctypes
import logging
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

import pystray
from PIL import Image

# ─── Constantes ──────────────────────────────────────────────────────────────────

APP_NAME    = "LMU Stats Viewer"

# Version lue depuis version.txt à la racine du projet
def _read_version() -> str:
    if getattr(sys, "frozen", False):
        v_file = Path(sys.executable).parent / "version.txt"
    else:
        v_file = Path(__file__).resolve().parent.parent / "version.txt"
    try:
        return v_file.read_text(encoding="utf-8").strip()
    except Exception:
        return "0.0.0"

APP_VERSION  = _read_version()
OPEN_CONFIG  = "--config" in sys.argv

# Ports à essayer dans l'ordre (80 nécessite parfois des droits admin,
# on bascule automatiquement sur le suivant si indisponible)
PREFERRED_PORTS = [80, 8080, 8081, 8082, 8090]

# ─── Chemins ─────────────────────────────────────────────────────────────────────

# Quand compilé avec PyInstaller (frozen), sys.executable est le .exe lui-même.
# En mode script, on remonte d'un niveau (launcher/ → LMU_Stats_Viewer/).
if getattr(sys, "frozen", False):
    APP_DIR = Path(sys.executable).parent
else:
    APP_DIR = Path(__file__).resolve().parent.parent

PHP_EXE    = APP_DIR / "php"    / "php.exe"
HTDOCS_DIR = APP_DIR / "htdocs"

# Logs et lock dans %APPDATA% pour éviter les erreurs de permission dans Program Files
_APPDATA_DIR = Path(os.environ.get("APPDATA", os.environ.get("TEMP", ""))) \
               / "LMU_Stats_Viewer"
_APPDATA_DIR.mkdir(parents=True, exist_ok=True)

LOG_FILE  = _APPDATA_DIR / "launcher.log"
PHP_LOG   = _APPDATA_DIR / "php_server.log"
LOCK_FILE = _APPDATA_DIR / "lmu_stats_viewer.lock"

# ─── Logging ─────────────────────────────────────────────────────────────────────

logging.basicConfig(
    filename=str(LOG_FILE),
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger()

# ─── État global ─────────────────────────────────────────────────────────────────

_php_process: subprocess.Popen | None = None
_server_port: int = 0

# ─── Utilitaires réseau ──────────────────────────────────────────────────────────

def find_free_port() -> int:
    """Retourne le premier port disponible parmi les préférés, ou un port libre de l'OS."""
    for p in PREFERRED_PORTS:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 0)
                s.bind(("127.0.0.1", p))
            return p
        except OSError:
            continue
    # Fallback : laisse l'OS choisir
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def is_port_open(port: int, timeout: float = 0.4) -> bool:
    """Vérifie si un port TCP local répond."""
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=timeout):
            return True
    except OSError:
        return False


def wait_for_port(port: int, timeout: float = 8.0) -> bool:
    """Attend qu'un port TCP local soit ouvert (polling toutes les 250 ms)."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if is_port_open(port):
            return True
        time.sleep(0.25)
    return False

# ─── Instance unique ─────────────────────────────────────────────────────────────

def check_already_running() -> bool:
    """
    Lit le fichier de verrouillage pour détecter une instance déjà active.
    Si c'est le cas, ouvre le navigateur et retourne True.
    """
    if not LOCK_FILE.exists():
        return False
    try:
        port = int(LOCK_FILE.read_text().strip())
        if is_port_open(port, timeout=0.5):
            log.info(f"Instance déjà active sur le port {port}")
            open_browser(f"http://localhost:{port}")
            return True
    except Exception:
        pass
    # Fichier verrou orphelin → on le supprime
    LOCK_FILE.unlink(missing_ok=True)
    return False

# ─── Navigateur ──────────────────────────────────────────────────────────────────

def open_browser(url: str) -> None:
    log.info(f"Ouverture navigateur : {url}")
    try:
        subprocess.Popen(
            ["cmd", "/c", "start", "", url],
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
    except Exception as e:
        log.error(f"Erreur ouverture navigateur : {e}")

# ─── Dialogue d'erreur ───────────────────────────────────────────────────────────

def show_error(message: str) -> None:
    """Affiche un dialogue d'erreur Windows natif (MessageBoxW via ctypes)."""
    log.error(f"ERREUR : {message}")
    try:
        # MB_OK (0x0) | MB_ICONERROR (0x10) | MB_SETFOREGROUND (0x10000)
        ctypes.windll.user32.MessageBoxW(0, message, APP_NAME, 0x10010)
    except Exception as e:
        log.error(f"Impossible d'afficher le dialogue : {e}")

# ─── Serveur PHP ─────────────────────────────────────────────────────────────────

def start_php(port: int) -> None:
    global _php_process

    if not PHP_EXE.exists():
        show_error(
            f"php.exe introuvable :\n{PHP_EXE}\n\n"
            f"Vérifiez que PHP est bien dans le dossier 'php'."
        )
        sys.exit(1)

    if not HTDOCS_DIR.is_dir():
        show_error(f"Dossier htdocs introuvable :\n{HTDOCS_DIR}")
        sys.exit(1)

    log.info(f"Démarrage PHP → 127.0.0.1:{port}  (htdocs: {HTDOCS_DIR})")

    try:
        php_log_f = open(str(PHP_LOG), "w", encoding="utf-8")
        _php_process = subprocess.Popen(
            [str(PHP_EXE), "-S", f"127.0.0.1:{port}", "-t", str(HTDOCS_DIR)],
            stdout=php_log_f,
            stderr=subprocess.STDOUT,
            creationflags=subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP,
        )
        log.info(f"PHP démarré (PID {_php_process.pid})")
    except Exception as e:
        show_error(f"Impossible de démarrer PHP :\n{e}")
        sys.exit(1)


def stop_php() -> None:
    global _php_process
    log.info("Arrêt du serveur PHP...")
    if _php_process and _php_process.poll() is None:
        _php_process.terminate()
        try:
            _php_process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            _php_process.kill()
        log.info("Serveur PHP arrêté.")
    try:
        LOCK_FILE.unlink(missing_ok=True)
    except Exception:
        pass

# ─── Icône tray ──────────────────────────────────────────────────────────────────

def load_icon() -> Image.Image:
    """
    Charge l'icône dans l'ordre de priorité :
    1. Icône embarquée dans le .exe (PyInstaller _MEIPASS)
    2. htdocs/logos/lmu.ico
    3. htdocs/logos/favicon.ico
    4. Carré bleu LMU (#0D88D6) généré à la volée
    """
    candidates: list[Path] = []

    if getattr(sys, "frozen", False):
        candidates.append(Path(sys._MEIPASS) / "lmu.ico")  # type: ignore[attr-defined]

    candidates += [
        HTDOCS_DIR / "logos" / "lmu.ico",
        HTDOCS_DIR / "logos" / "favicon.ico",
    ]

    for path in candidates:
        if path.exists():
            try:
                return Image.open(str(path))
            except Exception:
                continue

    # Fallback : carré bleu LMU
    img = Image.new("RGBA", (64, 64), color=(13, 136, 214, 255))
    return img


def _url(path: str = "") -> str:
    return f"http://localhost:{_server_port}{path}"


def _on_open(icon: pystray.Icon, item: pystray.MenuItem) -> None:
    open_browser(_url())


def _on_config(icon: pystray.Icon, item: pystray.MenuItem) -> None:
    open_browser(_url("/config.php"))


def _on_update(icon: pystray.Icon, item: pystray.MenuItem) -> None:
    open_browser(_url("/update.php"))


def _on_quit(icon: pystray.Icon, item: pystray.MenuItem) -> None:
    log.info("Quitter demandé depuis le tray")
    icon.stop()
    stop_php()


def create_tray() -> pystray.Icon:
    menu = pystray.Menu(
        pystray.MenuItem("Ouvrir LMU Stats",  _on_open,   default=True),
        pystray.MenuItem("Configuration",      _on_config),
        pystray.MenuItem("Mises à jour",       _on_update),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Quitter",            _on_quit),
    )
    return pystray.Icon(APP_NAME, load_icon(), APP_NAME, menu)

# ─── Point d'entrée ──────────────────────────────────────────────────────────────

def main() -> None:
    global _server_port

    log.info(f"{'='*50}")
    log.info(f"{APP_NAME} v{APP_VERSION} — Démarrage")
    log.info(f"Répertoire : {APP_DIR}")

    # ── Instance unique ──────────────────────────────────────────────────────────
    if check_already_running():
        sys.exit(0)

    # ── Choix du port ────────────────────────────────────────────────────────────
    _server_port = find_free_port()
    log.info(f"Port sélectionné : {_server_port}")

    # ── Démarrage PHP ────────────────────────────────────────────────────────────
    start_php(_server_port)

    # ── Attente de la réponse du serveur ─────────────────────────────────────────
    log.info("Attente du serveur PHP...")
    if not wait_for_port(_server_port, timeout=8.0):
        show_error(
            "Le serveur PHP n'a pas démarré à temps.\n"
            f"Consultez {LOG_FILE.name} pour les détails."
        )
        stop_php()
        sys.exit(1)

    log.info("Serveur PHP prêt !")

    # ── Fichier verrou ───────────────────────────────────────────────────────────
    LOCK_FILE.write_text(str(_server_port))

    # ── Ouverture du navigateur ──────────────────────────────────────────────────
    start_page = "/config.php" if OPEN_CONFIG else "/"
    open_browser(f"http://localhost:{_server_port}{start_page}")

    # ── Icône tray (bloquant jusqu'au Quitter) ───────────────────────────────────
    tray = create_tray()
    log.info("Icône tray active. Application prête.")

    tray.run()

    log.info(f"{APP_NAME} — Terminé")


if __name__ == "__main__":
    main()
