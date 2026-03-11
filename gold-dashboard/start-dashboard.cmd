@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%restart-dashboard.ps1" -NoBrowser
endlocal
