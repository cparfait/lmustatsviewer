@echo off
setlocal enabledelayedexpansion
title LMU Stats Viewer — Build Launcher

echo.
echo  ============================================================
echo   LMU Stats Viewer — Compilation du Launcher
echo  ============================================================
echo.

REM Se placer dans le dossier du script
cd /d "%~dp0"

REM ── 1. Vérification Python ────────────────────────────────────────────────────
python --version > nul 2>&1
if errorlevel 1 (
    echo  [ERREUR] Python introuvable dans le PATH.
    echo           Installez Python 3.10+ depuis https://python.org
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('python --version 2^>^&1') do echo  Python : %%v

REM ── 2. Dépendances Python ────────────────────────────────────────────────────
echo.
echo  [1/3] Installation des dependances (pystray, pyinstaller)...
pip install pystray pyinstaller --quiet --disable-pip-version-check
if errorlevel 1 (
    echo  [ERREUR] pip install a echoue. Verifiez votre connexion internet.
    pause & exit /b 1
)
echo        OK

REM ── 3. Compilation PyInstaller ──────────────────────────────────────────────
echo.
echo  [2/3] Compilation en cours...
echo.

pyinstaller ^
    --onefile ^
    --windowed ^
    --noconsole ^
    --name "LMU_Stats_Viewer" ^
    --icon "..\htdocs\logos\lmu.ico" ^
    --add-data "..\htdocs\logos\lmu.ico;." ^
    --add-data "..\version.txt;." ^
    --distpath ".." ^
    --workpath "build_temp" ^
    --specpath "." ^
    --clean ^
    launcher.py

if errorlevel 1 (
    echo.
    echo  [ERREUR] PyInstaller a echoue. Consultez les messages ci-dessus.
    pause & exit /b 1
)

REM ── 4. Nettoyage des fichiers temporaires ────────────────────────────────────
echo.
echo  [3/3] Nettoyage...
if exist "build_temp"             rmdir /s /q "build_temp"       > nul 2>&1
if exist "LMU_Stats_Viewer.spec"  del   /f    "LMU_Stats_Viewer.spec" > nul 2>&1

REM ── Résultat ────────────────────────────────────────────────────────────────
echo.
echo  ============================================================
echo   Succes !  LMU_Stats_Viewer.exe cree dans :
echo   %~dp0..
echo  ============================================================
echo.
echo   Utilisation :
echo   - Copier LMU_Stats_Viewer.exe avec les dossiers php/ et htdocs/
echo   - Double-cliquer sur LMU_Stats_Viewer.exe
echo   - L'icone apparait dans la barre systeme
echo.
pause
