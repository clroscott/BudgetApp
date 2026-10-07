@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Update-DevelopmentDatabase.ps1"
exit /b %errorlevel%
