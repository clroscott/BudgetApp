[CmdletBinding()]
param([string]$ServerInstance = 'BIG-Z\SQLEXPRESS')

$ErrorActionPreference = 'Stop'
$taskRepositoryRoot = Split-Path -Parent $PSScriptRoot
$taskServerProject = Join-Path $taskRepositoryRoot 'BudgetApp\BudgetApp.Server\BudgetApp.Server.csproj'
$taskInfrastructureProject = Join-Path $taskRepositoryRoot 'BudgetApp\BudgetApp.Infrastructure\BudgetApp.Infrastructure.csproj'
foreach ($taskProject in @($taskServerProject, $taskInfrastructureProject)) {
    if (-not (Test-Path -LiteralPath $taskProject -PathType Leaf)) { throw "Project not found: $taskProject" }
}
if ([string]::IsNullOrWhiteSpace($ServerInstance)) { throw 'Enter a SQL Server instance.' }

# Catalog is fixed, not user-supplied. The builder quotes the server name safely.
$taskConnection = [System.Data.Common.DbConnectionStringBuilder]::new()
$taskConnection['Server'] = $ServerInstance
$taskConnection['Database'] = 'BudgetAppDb_DEV'
$taskConnection['Integrated Security'] = $true
$taskConnection['TrustServerCertificate'] = $true
$taskPreviousEnvironment = [Environment]::GetEnvironmentVariable('ASPNETCORE_ENVIRONMENT', 'Process')
$taskPreviousDotnetEnvironment = [Environment]::GetEnvironmentVariable('DOTNET_ENVIRONMENT', 'Process')
$taskPreviousConnection = [Environment]::GetEnvironmentVariable('ConnectionStrings__BudgetApp', 'Process')

Push-Location -LiteralPath $taskRepositoryRoot
try {
    $env:ASPNETCORE_ENVIRONMENT = 'Development'
    $env:DOTNET_ENVIRONMENT = 'Development'
    $env:ConnectionStrings__BudgetApp = $taskConnection.ConnectionString
    Write-Host "Updating DEVELOPMENT database BudgetAppDb_DEV on $ServerInstance. Production is not a target of this script."
    & dotnet tool restore
    if ($LASTEXITCODE -ne 0) { throw 'Local tool restore failed; database update was not run.' }
    $taskEfArguments = @('tool', 'run', 'dotnet-ef', 'database', 'update', '--project', $taskInfrastructureProject,
        '--startup-project', $taskServerProject, '--configuration', 'Release', '--connection', $taskConnection.ConnectionString)
    & dotnet @taskEfArguments
    if ($LASTEXITCODE -ne 0) { throw 'Development database update failed. Do not retry against production; check the error above.' }
    Write-Host 'Development database update completed.'
}
finally {
    [Environment]::SetEnvironmentVariable('ASPNETCORE_ENVIRONMENT', $taskPreviousEnvironment, 'Process')
    [Environment]::SetEnvironmentVariable('DOTNET_ENVIRONMENT', $taskPreviousDotnetEnvironment, 'Process')
    [Environment]::SetEnvironmentVariable('ConnectionStrings__BudgetApp', $taskPreviousConnection, 'Process')
    Pop-Location
}
