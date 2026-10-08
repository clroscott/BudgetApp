@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Configure-ProductionGmail.ps1" %*
exit /b %errorlevel%
