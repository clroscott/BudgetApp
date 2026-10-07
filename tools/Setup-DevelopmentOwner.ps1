[CmdletBinding()]
param([string]$Email)

$ErrorActionPreference = 'Stop'
$taskRepositoryRoot = Split-Path -Parent $PSScriptRoot
$taskServerProject = Join-Path $taskRepositoryRoot 'BudgetApp\BudgetApp.Server\BudgetApp.Server.csproj'
if (-not (Test-Path -LiteralPath $taskServerProject -PathType Leaf)) { throw "Project not found: $taskServerProject" }
if ([string]::IsNullOrWhiteSpace($Email)) { $Email = Read-Host 'Existing account email for the initial Development installation owner' }
if ([string]::IsNullOrWhiteSpace($Email)) { throw 'No email entered. Nothing was changed.' }
$taskPreviousEnvironment = [Environment]::GetEnvironmentVariable('ASPNETCORE_ENVIRONMENT', 'Process')
$taskPreviousDotnetEnvironment = [Environment]::GetEnvironmentVariable('DOTNET_ENVIRONMENT', 'Process')
Push-Location -LiteralPath $taskRepositoryRoot
try {
    $env:ASPNETCORE_ENVIRONMENT = 'Development'
    $env:DOTNET_ENVIRONMENT = 'Development'
    Write-Host 'DEVELOPMENT ONLY. Review the database and account shown by the setup tool before confirming.'
    & dotnet run --project $taskServerProject --configuration Release --no-launch-profile '-p:SkipClientProjectReference=true' -- --bootstrap-owner $Email.Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Owner setup did not complete. Read the controlled error above; do not retry against production.' }
}
finally {
    [Environment]::SetEnvironmentVariable('ASPNETCORE_ENVIRONMENT', $taskPreviousEnvironment, 'Process')
    [Environment]::SetEnvironmentVariable('DOTNET_ENVIRONMENT', $taskPreviousDotnetEnvironment, 'Process')
    Pop-Location
}
