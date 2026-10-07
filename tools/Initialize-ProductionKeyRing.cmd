@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Initialize-ProductionKeyRing.ps1" %*
exit /b %errorlevel%
