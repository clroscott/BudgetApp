@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Backup-ProductionKeyRing.ps1" %*
exit /b %errorlevel%
