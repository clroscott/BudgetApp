@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0New-ProductionKeyCertificate.ps1" %*
exit /b %errorlevel%
