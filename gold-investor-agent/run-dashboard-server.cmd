@echo off
setlocal
set "PROJECT_DIR=%~dp0"

if defined GOLD_NODE_EXE (
  if exist "%GOLD_NODE_EXE%" (
    "%GOLD_NODE_EXE%" "%PROJECT_DIR%src\server.mjs"
    exit /b %errorlevel%
  )
)

for /f "delims=" %%I in ('where.exe node 2^>nul') do (
  if exist "%%~fI" (
    "%%~fI" "%PROJECT_DIR%src\server.mjs"
    exit /b %errorlevel%
  )
)

for %%I in ("%ProgramFiles%\nodejs\node.exe" "%LocalAppData%\Programs\nodejs\node.exe") do (
  if exist "%%~fI" (
    "%%~fI" "%PROJECT_DIR%src\server.mjs"
    exit /b %errorlevel%
  )
)

echo Node.js not found. Install Node.js 22+ first.
exit /b 1
