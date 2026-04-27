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
echo  [1/4] Installation des dependances (pystray, pyinstaller)...
pip install pystray==0.19.5 pyinstaller==6.3.0 --quiet --disable-pip-version-check
if errorlevel 1 (
    echo  [ERREUR] pip install a echoue. Verifiez votre connexion internet.
    pause & exit /b 1
)
echo        OK

REM ── 3. Compilation PyInstaller ──────────────────────────────────────────────
echo.
echo  [2/4] Compilation en cours...
echo.

python -m PyInstaller ^
    --onefile ^
    --windowed ^
    --noconsole ^
    --name "LMU_Stats_Viewer" ^
    --icon "..\htdocs\logos\lmu.ico" ^
    --add-data "..\htdocs\logos\lmu.ico;." ^
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
echo  [3/4] Nettoyage...
if exist "build_temp"             rmdir /s /q "build_temp"       > nul 2>&1
if exist "LMU_Stats_Viewer.spec"  del   /f    "LMU_Stats_Viewer.spec" > nul 2>&1

REM ── 5. Préparation du dossier release ────────────────────────────────────────
echo.
echo  [4/4] Preparation du dossier release...
set RELEASE_DIR=%~dp0..\release

if not exist "%RELEASE_DIR%" mkdir "%RELEASE_DIR%"

REM Copier les fichiers nécessaires à InnoSetup
copy /Y "%~dp0..\LMU_Stats_Viewer.exe" "%RELEASE_DIR%\"        > nul
copy /Y "%~dp0..\version.txt"          "%RELEASE_DIR%\"        > nul
copy /Y "%~dp0..\setup.iss"            "%RELEASE_DIR%\"        > nul
if exist "%~dp0..\CHANGELOG.md" copy /Y "%~dp0..\CHANGELOG.md" "%RELEASE_DIR%\" > nul

REM htdocs (supprime l'ancien pour éviter les fichiers obsolètes)
if exist "%RELEASE_DIR%\htdocs" rmdir /s /q "%RELEASE_DIR%\htdocs" > nul 2>&1
xcopy /E /I /Y /Q "%~dp0..\htdocs" "%RELEASE_DIR%\htdocs"     > nul

REM php (non versionné, à ajouter manuellement si absent)
if exist "%~dp0..\php" (
    xcopy /E /I /Y /Q "%~dp0..\php" "%RELEASE_DIR%\php"       > nul
    echo        php/ copie
) else (
    echo  [WARN] Dossier php/ absent - copiez-le manuellement dans release\
)
echo        OK

REM ── Résultat ────────────────────────────────────────────────────────────────
echo.
echo  ============================================================
echo   Succes !
echo.
echo   Launcher : %~dp0..\LMU_Stats_Viewer.exe
echo   Release  : %RELEASE_DIR%
echo.
echo   Prochaine etape :
echo   Ouvrir release\setup.iss dans InnoSetup et compiler
echo  ============================================================
echo.
pause
