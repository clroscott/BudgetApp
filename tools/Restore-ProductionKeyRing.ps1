[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ServerExecutable,
    [Parameter(Mandatory = $true)][string]$BackupDirectory,
    [Parameter(Mandatory = $true)][string]$Destination
)
. (Join-Path $PSScriptRoot 'KeyRing-Windows.Common.ps1')
Assert-KeyRingWindows
$taskBackup = Resolve-KeyRingPath $BackupDirectory
$taskDestination = Resolve-KeyRingPath $Destination
$taskExecutable = Assert-KeyRingExecutable $ServerExecutable $taskDestination
if (Test-Path -LiteralPath $taskDestination) { throw 'Restore destination must not exist. Live keys are never overwritten or deleted.' }
$taskManifest = Get-Content -LiteralPath (Join-Path $taskBackup 'backup-manifest.json') -Raw | ConvertFrom-Json
if ($taskManifest.Version -ne 1 -or $taskManifest.ApplicationName -ne 'BudgetApp.Production.v1') { throw 'Unsupported backup.' }
$taskThumbprints = @(@($taskManifest.CertificateThumbprint) + @($taskManifest.DecryptionCertificateThumbprints) | Select-Object -Unique)
$taskNames = @($taskManifest.Files.PSObject.Properties.Name)
foreach ($taskRequired in @('ring\budgetapp-key-ring.json', 'recovery.keyring-probe')) {
    if ($taskNames -notcontains $taskRequired) { throw 'Required recovery file is not listed in the backup manifest.' }
}
foreach ($taskThumbprint in $taskThumbprints) {
    if ($taskThumbprint -notmatch '^[0-9A-Fa-f]{40}$' -or $taskNames -notcontains ($taskThumbprint + '.pfx')) { throw 'Required certificate backup is not listed.' }
}
foreach ($taskEntry in $taskManifest.Files.PSObject.Properties) {
    $taskRelative = $taskEntry.Name
    if ($taskRelative -notmatch '^(ring\\(key-[0-9a-fA-F-]+\.xml|revocation-[0-9A-Za-z-]+\.xml|budgetapp-key-ring\.json)|[0-9A-Fa-f]{40}\.pfx|recovery\.keyring-probe)$') { throw 'Unexpected backup filename; restore refused.' }
    $taskFile = Join-Path $taskBackup $taskRelative
    if (-not (Test-Path -LiteralPath $taskFile -PathType Leaf) -or
        (Get-Item -LiteralPath $taskFile -Force).Attributes -band [IO.FileAttributes]::ReparsePoint -or
        (Get-FileHash -LiteralPath $taskFile -Algorithm SHA256).Hash -ne $taskEntry.Value) { throw 'Backup is missing files or failed its integrity check.' }
}
Write-Host ('Restore target: ' + $taskDestination)
Write-Host 'This imports private certificates into this Windows account and creates a NEW isolated ring. It does not switch Production to it.'
if ((Read-Host 'Type RESTORE KEYS to continue') -cne 'RESTORE KEYS') { throw 'Canceled.' }
$taskPassword = Read-Host 'Certificate backup password' -AsSecureString
try {
    # Always test the portable exports/password, even when an on-host rehearsal
    # could otherwise succeed by reusing already installed private certificates.
    foreach ($taskThumbprint in $taskThumbprints) {
        $taskPfxData = Get-PfxData -FilePath (Join-Path $taskBackup ($taskThumbprint + '.pfx')) -Password $taskPassword
        if (@($taskPfxData.EndEntityCertificates).Count -ne 1 -or $taskPfxData.EndEntityCertificates[0].Thumbprint -ne $taskThumbprint) {
            throw 'Portable certificate backup does not match the expected thumbprint.'
        }
    }
    foreach ($taskThumbprint in $taskThumbprints) {
        if ($taskThumbprint -notmatch '^[0-9A-Fa-f]{40}$') { throw 'Invalid backup certificate reference.' }
        $taskCertPath = 'Cert:\CurrentUser\My\' + $taskThumbprint
        if (Test-Path -LiteralPath $taskCertPath) {
            # On-host rehearsal does not overwrite existing private-key permissions.
            Get-KeyRingCertificate $taskThumbprint | Out-Null
        } else {
            $taskCertificate = Import-PfxCertificate -FilePath (Join-Path $taskBackup ($taskThumbprint + '.pfx')) -CertStoreLocation 'Cert:\CurrentUser\My' -Password $taskPassword -Exportable
            if ($taskCertificate.Thumbprint -ne $taskThumbprint) { throw 'Restored certificate does not match the backup reference.' }
            Protect-KeyRingCertificate $taskCertificate
        }
    }
    New-Item -ItemType Directory -Path $taskDestination | Out-Null
    Set-KeyRingRestrictedAcl -Path $taskDestination -Directory
    foreach ($taskEntry in $taskManifest.Files.PSObject.Properties) {
        if ($taskEntry.Name.StartsWith('ring\', [StringComparison]::Ordinal)) {
            Copy-Item -LiteralPath (Join-Path $taskBackup $taskEntry.Name) -Destination $taskDestination
        }
    }
    Invoke-KeyRingCommand $taskExecutable $taskDestination $taskManifest.CertificateThumbprint @($taskManifest.DecryptionCertificateThumbprints) verify-probe (Join-Path $taskBackup 'recovery.keyring-probe')
    Write-Host 'VERIFIED: the restored ring decrypts a pre-backup probe. Production configuration remains unchanged.'
    Write-Host 'For a real recovery, separately review the new ring path/certificate settings and run the app smoke tests before reopening access.'
} finally { $taskPassword = $null }
