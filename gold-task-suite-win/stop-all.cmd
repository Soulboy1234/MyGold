@echo off
setlocal
set "SUITE_DIR=%~dp0"
call "%SUITE_DIR%..\gold-investor-agent\stop-panel.cmd"
call "%SUITE_DIR%..\gold-investor-agent\stop-agent.cmd"
call "%SUITE_DIR%..\gold-dashboard\stop-dashboard.cmd"
call "%SUITE_DIR%..\gold-monitor\stop-monitor.cmd"
endlocal
