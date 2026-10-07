@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Setup-DevelopmentOwner.ps1"
exit /b %errorlevel%
