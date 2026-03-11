@echo off
setlocal
set "SUITE_DIR=%~dp0"
call "%SUITE_DIR%start-all.cmd"
exit /b %errorlevel%
