@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

if defined GOLD_NODE_EXE (
  if exist "%GOLD_NODE_EXE%" (
    "%GOLD_NODE_EXE%" "%SCRIPT_DIR%src\agent.mjs"
    exit /b %errorlevel%
  )
)

for /f "delims=" %%I in ('where.exe node 2^>nul') do (
  if exist "%%~fI" (
    "%%~fI" "%SCRIPT_DIR%src\agent.mjs"
    exit /b %errorlevel%
  )
)

for %%I in ("%ProgramFiles%\nodejs\node.exe" "%LocalAppData%\Programs\nodejs\node.exe") do (
  if exist "%%~fI" (
    "%%~fI" "%SCRIPT_DIR%src\agent.mjs"
    exit /b %errorlevel%
  )
)

echo Node.js not found. Install Node.js 22+ first.
exit /b 1
