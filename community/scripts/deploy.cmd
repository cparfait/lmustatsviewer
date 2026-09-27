@echo off
rem Mise en ligne du service communautaire depuis cmd / PowerShell (voir deploy.sh).
rem   community\scripts\deploy.cmd [--smoke] [--no-tests]
setlocal
set "GITBASH=%ProgramFiles%\Git\bin\bash.exe"
if not exist "%GITBASH%" (
  echo Git Bash introuvable : %GITBASH%
  exit /b 1
)
"%GITBASH%" "%~dp0deploy.sh" %*
