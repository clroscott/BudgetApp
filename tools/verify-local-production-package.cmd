@echo off
setlocal

if "%~1"=="" (
    echo Usage: tools\verify-local-production-package.cmd ^<publish-folder^>
    echo Example: tools\verify-local-production-package.cmd artifacts\local-production-next
    exit /b 2
)

set "PUBLISH_DIRECTORY=%~f1"

if not exist "%PUBLISH_DIRECTORY%\" (
    echo ERROR: Publish folder does not exist: %PUBLISH_DIRECTORY%
    exit /b 1
)

echo Checking local Production package:
echo %PUBLISH_DIRECTORY%
echo.

call :require_file "BudgetApp.Server.exe"
if errorlevel 1 exit /b 1
call :require_file "BudgetApp.Server.dll"
if errorlevel 1 exit /b 1
call :require_file "BudgetApp.Server.deps.json"
if errorlevel 1 exit /b 1
call :require_file "BudgetApp.Server.runtimeconfig.json"
if errorlevel 1 exit /b 1
call :require_file "appsettings.json"
if errorlevel 1 exit /b 1
call :require_file "wwwroot\index.html"
if errorlevel 1 exit /b 1

for %%e in (pfx p12 bak bacpac mdf ldf) do (
    dir /s /b "%PUBLISH_DIRECTORY%\*.%%e" >nul 2>nul
    if not errorlevel 1 (
        echo ERROR: The package contains a *.%%e file. Certificates, backups, and database files do not belong in the application package.
        exit /b 1
    )
)

echo.
echo READY: The local Production package contains the expected server and client files.
echo This verifies package structure only. It does not verify secrets, certificates, migrations, or the live database.
exit /b 0

:require_file
if not exist "%PUBLISH_DIRECTORY%\%~1" (
    echo ERROR: Missing %~1
    exit /b 1
)
echo Found %~1
exit /b 0
