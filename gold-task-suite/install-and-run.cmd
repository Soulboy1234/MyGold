@echo off
setlocal
set "SUITE_DIR=%~dp0"
call "%SUITE_DIR%install.cmd"
if errorlevel 1 exit /b %errorlevel%
call "%SUITE_DIR%start-all.cmd"
exit /b %errorlevel%
