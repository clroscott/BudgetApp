@echo off
setlocal

set "REPOSITORY_ROOT=%~dp0.."
pushd "%REPOSITORY_ROOT%" >nul
if errorlevel 1 goto :failure

rem Verify Development independently of stale values inherited from a parent process.
set "ASPNETCORE_ENVIRONMENT=Development"
set "ConnectionStrings__BudgetApp="

echo Checking required development tools...
where dotnet >nul 2>nul
if errorlevel 1 (
    echo ERROR: The .NET SDK was not found on PATH.
    goto :failure
)

where node >nul 2>nul
if errorlevel 1 (
    echo ERROR: Node.js was not found on PATH.
    goto :failure
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
    echo ERROR: npm.cmd was not found on PATH.
    goto :failure
)

dotnet --version
node --version
call npm.cmd --version
if errorlevel 1 goto :failure

echo.
echo Checking the Development connection-string key...
dotnet user-secrets list --project "BudgetApp\BudgetApp.Server\BudgetApp.Server.csproj" 2>nul | findstr /b /c:"ConnectionStrings:BudgetApp =" >nul
if errorlevel 1 (
    echo ERROR: ConnectionStrings:BudgetApp is missing from Development User Secrets.
    echo Follow docs\development-setup.md, then run this command again.
    goto :failure
)

echo.
echo Checking the React client...
pushd "BudgetApp\budgetapp.client" >nul
call npm.cmd run lint
if errorlevel 1 (
    popd
    goto :failure
)
call npm.cmd run build
if errorlevel 1 (
    popd
    goto :failure
)
popd

echo.
echo Checking the .NET solution...
dotnet build "BudgetApp\BudgetApp.slnx" --no-restore
if errorlevel 1 goto :failure

dotnet test "BudgetApp\BudgetApp.Tests\BudgetApp.Tests.csproj" --no-build
if errorlevel 1 goto :failure

echo.
echo Checking EF Core migration visibility against Development...
dotnet tool run dotnet-ef migrations list --no-build --project "BudgetApp\BudgetApp.Infrastructure\BudgetApp.Infrastructure.csproj" --startup-project "BudgetApp\BudgetApp.Server\BudgetApp.Server.csproj"
if errorlevel 1 goto :failure

echo.
echo READY: BudgetApp development tools, configuration, builds, tests, and migrations are available.
popd >nul
exit /b 0

:failure
echo.
echo NOT READY: Fix the error above and run tools\verify-development-environment.cmd again.
popd >nul 2>nul
exit /b 1
