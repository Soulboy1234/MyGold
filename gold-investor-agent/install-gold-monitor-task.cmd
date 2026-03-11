@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "TASK_NAME=CodexGoldMonitor"
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%..\gold-monitor\install-task.ps1" -TaskName "%TASK_NAME%"
if %errorlevel% neq 0 (
  echo Failed to install scheduled task "%TASK_NAME%".
  exit /b %errorlevel%
)
echo Scheduled task "%TASK_NAME%" installed.
endlocal
