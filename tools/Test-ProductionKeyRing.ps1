[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ServerExecutable,
    [Parameter(Mandatory = $true)][string]$CertificateThumbprint,
    [string]$KeyRingPath = 'C:\Apps\BudgetApp\data\protection-keys\production',
    [string[]]$DecryptionCertificateThumbprints = @()
)
. (Join-Path $PSScriptRoot 'KeyRing-Windows.Common.ps1')
Assert-KeyRingWindows
$taskRing = Resolve-KeyRingPath $KeyRingPath
$taskExecutable = Assert-KeyRingExecutable $ServerExecutable $taskRing
Invoke-KeyRingCommand $taskExecutable $taskRing $CertificateThumbprint $DecryptionCertificateThumbprints check
