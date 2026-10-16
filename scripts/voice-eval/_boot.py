"""Amorce commune des scripts d'évaluation vocale.

Les scripts tournent en `python -I` (mode isolé : ni dossier courant ni variables
d'environnement dans le chemin d'import, par prudence vis-à-vis des fichiers
téléchargés passés en argument). Ce mode coupe aussi le site-packages
utilisateur, où sont installés onnxruntime / kokoro / faster-whisper : on le
rajoute explicitement, en fin de chemin.
"""

import site
import sys

_user = site.getusersitepackages()
if _user not in sys.path:
    sys.path.append(_user)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")


def below_normal_priority():
    """Passe le processus courant en priorité « sous la normale » (comme Piper dans l'app)."""
    if sys.platform == "win32":
        import ctypes

        k32 = ctypes.windll.kernel32
        k32.SetPriorityClass(k32.GetCurrentProcess(), 0x00004000)
