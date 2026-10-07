@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Test-ProductionKeyRing.ps1" %*
exit /b %errorlevel%
