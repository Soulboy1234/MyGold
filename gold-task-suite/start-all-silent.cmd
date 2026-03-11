@echo off
setlocal
set "SUITE_DIR=%~dp0"
call "%SUITE_DIR%..\gold-monitor\start-monitor.cmd"
call "%SUITE_DIR%..\gold-dashboard\start-dashboard.cmd"
call "%SUITE_DIR%..\gold-investor-agent\start-agent.cmd"
powershell -NoProfile -ExecutionPolicy Bypass -File "%SUITE_DIR%..\gold-investor-agent\restart-dashboard.ps1"
endlocal
