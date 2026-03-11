@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"
call "%SCRIPT_DIR%start-agent.cmd"
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%restart-dashboard.ps1"
start "" http://127.0.0.1:3080
endlocal
