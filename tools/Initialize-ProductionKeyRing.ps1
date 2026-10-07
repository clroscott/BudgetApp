[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ServerExecutable,
    [string]$KeyRingPath = 'C:\Apps\BudgetApp\data\protection-keys\production'
)
. (Join-Path $PSScriptRoot 'KeyRing-Windows.Common.ps1')
Assert-KeyRingWindows
$taskRing = Resolve-KeyRingPath $KeyRingPath
$taskExecutable = Assert-KeyRingExecutable $ServerExecutable $taskRing
if (Test-Path -LiteralPath $taskRing) { throw 'Target already exists. Initialization never changes existing keys/permissions; use check or recovery instead.' }
Write-Host 'Run as the same Windows account that starts Production. Stop the app first.'
Write-Host ('New Production ring: ' + $taskRing)
Write-Host 'This deliberately replaces the old default-ring login/token context, NOT financial data. Keep the old ring untouched.'
if ((Read-Host 'Type PREPARE KEYS to create the folder and dedicated certificate') -cne 'PREPARE KEYS') { throw 'Canceled. Nothing was changed.' }
New-Item -ItemType Directory -Path $taskRing | Out-Null
Set-KeyRingRestrictedAcl -Path $taskRing -Directory
$taskCertificate = New-KeyRingCertificate
Invoke-KeyRingCommand -Executable $taskExecutable -KeyRingPath $taskRing -Thumbprint $taskCertificate.Thumbprint -Operation initialize
Write-Host 'Add these NON-SECRET values to the process-scoped Production startup script:'
Write-Host ('$env:DataProtection__KeyRingPath = ''' + $taskRing + '''')
Write-Host ('$env:DataProtection__CertificateThumbprint = ''' + $taskCertificate.Thumbprint + '''')
Write-Host 'Next: create and test a protected backup before deploying. No startup script was edited automatically.'
