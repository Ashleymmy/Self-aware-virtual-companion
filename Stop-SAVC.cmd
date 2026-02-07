@echo off
setlocal

set "PS_SCRIPT="
for /f "usebackq delims=" %%I in (`wsl.exe wslpath -w /home/min/SAVC/Self-aware-virtual-companion/scripts/stop_project.ps1 2^>nul`) do set "PS_SCRIPT=%%I"

if not defined PS_SCRIPT (
  set "SCRIPT_DIR=%~dp0"
  set "PS_SCRIPT=%SCRIPT_DIR%scripts\stop_project.ps1"
)

if not exist "%PS_SCRIPT%" (
  echo [ERROR] Missing stop script: "%PS_SCRIPT%"
  echo [HINT] Ensure this repo exists at /home/min/SAVC/Self-aware-virtual-companion in WSL.
  exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%"
exit /b %ERRORLEVEL%
