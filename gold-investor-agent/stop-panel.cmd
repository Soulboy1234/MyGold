@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%stop-dashboard.ps1"
endlocal
