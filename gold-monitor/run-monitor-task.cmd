@echo off
setlocal
set "PROJECT_DIR=%~dp0"
set "LOG_FILE=%PROJECT_DIR%out\task.log"

if not exist "%PROJECT_DIR%out" mkdir "%PROJECT_DIR%out"

if defined GOLD_NODE_EXE (
  if exist "%GOLD_NODE_EXE%" (
    "%GOLD_NODE_EXE%" "%PROJECT_DIR%src\monitor.mjs" >> "%LOG_FILE%" 2>&1
    exit /b %errorlevel%
  )
)

for /f "delims=" %%I in ('where.exe node 2^>nul') do (
  if exist "%%~fI" (
    "%%~fI" "%PROJECT_DIR%src\monitor.mjs" >> "%LOG_FILE%" 2>&1
    exit /b %errorlevel%
  )
)

for %%I in ("%ProgramFiles%\nodejs\node.exe" "%LocalAppData%\Programs\nodejs\node.exe") do (
  if exist "%%~fI" (
    "%%~fI" "%PROJECT_DIR%src\monitor.mjs" >> "%LOG_FILE%" 2>&1
    exit /b %errorlevel%
  )
)

echo Node.js not found. Install Node.js 22+ first. >> "%LOG_FILE%"
exit /b 1
