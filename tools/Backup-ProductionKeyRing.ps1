[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ServerExecutable,
    [Parameter(Mandatory = $true)][string]$CertificateThumbprint,
    [Parameter(Mandatory = $true)][string]$Destination,
    [string]$KeyRingPath = 'C:\Apps\BudgetApp\data\protection-keys\production',
    [string[]]$DecryptionCertificateThumbprints = @()
)
. (Join-Path $PSScriptRoot 'KeyRing-Windows.Common.ps1')
Assert-KeyRingWindows
$CertificateThumbprint = Normalize-KeyRingThumbprint $CertificateThumbprint
$DecryptionCertificateThumbprints = @($DecryptionCertificateThumbprints | ForEach-Object { Normalize-KeyRingThumbprint $_ })
$taskRing = Resolve-KeyRingPath $KeyRingPath
$taskDestination = Resolve-KeyRingPath $Destination
$taskExecutable = Assert-KeyRingExecutable $ServerExecutable $taskRing
Assert-KeyRingExecutable $ServerExecutable $taskDestination | Out-Null
if ($taskDestination -eq $taskRing -or $taskDestination.StartsWith($taskRing + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Backup must be outside the live ring.' }
if (Test-Path -LiteralPath $taskDestination) { throw 'Backup destination already exists; nothing is overwritten.' }
Write-Host 'Stop BudgetApp first. Keep the backup on encrypted storage; its password must be stored separately.'
if ((Read-Host 'Type BACKUP KEYS to continue') -cne 'BACKUP KEYS') { throw 'Canceled.' }
$taskPassword = Read-Host 'Strong password for the portable certificate backup (save in your password manager)' -AsSecureString
if ($taskPassword.Length -lt 16) { throw 'Use a backup password of at least 16 characters.' }
try {
    Invoke-KeyRingCommand $taskExecutable $taskRing $CertificateThumbprint $DecryptionCertificateThumbprints check
    New-Item -ItemType Directory -Path $taskDestination | Out-Null
    Set-KeyRingRestrictedAcl -Path $taskDestination -Directory
    # Protection may roll an expiring key. Write the probe BEFORE copying the ring,
    # so the backup includes whichever key protects the probe.
    Invoke-KeyRingCommand $taskExecutable $taskRing $CertificateThumbprint $DecryptionCertificateThumbprints write-probe (Join-Path $taskDestination 'recovery.keyring-probe')
    $taskRingBackup = Join-Path $taskDestination 'ring'
    New-Item -ItemType Directory -Path $taskRingBackup | Out-Null
    foreach ($taskFile in Get-ChildItem -LiteralPath $taskRing -File -Force) {
        if ($taskFile.Name -eq 'budgetapp-key-ring.json' -or $taskFile.Extension -eq '.xml') {
            if ($taskFile.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Unexpected symbolic link in ring.' }
            Copy-Item -LiteralPath $taskFile.FullName -Destination $taskRingBackup
        }
    }
    # Include every wrapping certificate actually referenced by the copied ring,
    # including retained settings loaded from a package's appsettings JSON.
    $taskReferencedThumbprints = @()
    foreach ($taskXmlFile in Get-ChildItem -LiteralPath $taskRingBackup -Filter '*.xml' -File) {
        $taskXmlSettings = New-Object System.Xml.XmlReaderSettings
        $taskXmlSettings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
        $taskXmlSettings.MaxCharactersInDocument = 1048576
        $taskXmlReader = [System.Xml.XmlReader]::Create($taskXmlFile.FullName, $taskXmlSettings)
        try {
            $taskXml = New-Object System.Xml.XmlDocument
            $taskXml.XmlResolver = $null
            $taskXml.Load($taskXmlReader)
            foreach ($taskElement in $taskXml.SelectNodes('//*[local-name()="X509Certificate"]')) {
                $taskPublicCertificate = [Security.Cryptography.X509Certificates.X509Certificate2]::new([Convert]::FromBase64String($taskElement.InnerText))
                try { $taskReferencedThumbprints += $taskPublicCertificate.Thumbprint } finally { $taskPublicCertificate.Dispose() }
            }
        } finally { $taskXmlReader.Dispose() }
    }
    $taskThumbprints = @(@($CertificateThumbprint) + @($DecryptionCertificateThumbprints) + $taskReferencedThumbprints | Select-Object -Unique)
    foreach ($taskThumbprint in $taskThumbprints) {
        $taskCertificate = Get-KeyRingCertificate $taskThumbprint
        $taskCertificateFile = Join-Path $taskDestination ($taskCertificate.Thumbprint + '.pfx')
        Export-PfxCertificate -Cert $taskCertificate -FilePath $taskCertificateFile -Password $taskPassword -CryptoAlgorithmOption AES256_SHA256 | Out-Null
        Get-PfxData -FilePath $taskCertificateFile -Password $taskPassword | Out-Null
    }
    $taskHashes = @{}
    foreach ($taskFile in Get-ChildItem -LiteralPath $taskDestination -File -Recurse) {
        $taskRelative = $taskFile.FullName.Substring($taskDestination.Length + 1)
        $taskHashes[$taskRelative] = (Get-FileHash -LiteralPath $taskFile.FullName -Algorithm SHA256).Hash
    }
    @{ Version = 1; ApplicationName = 'BudgetApp.Production.v1'; CreatedUtc = [DateTime]::UtcNow.ToString('o');
        CertificateThumbprint = $CertificateThumbprint; DecryptionCertificateThumbprints = @($taskThumbprints | Where-Object { $_ -ne $CertificateThumbprint }); Files = $taskHashes } |
        ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $taskDestination 'backup-manifest.json') -Encoding UTF8
    Write-Host 'Backup created. Rehearse restore into a NEW isolated directory before calling it verified.'
    Write-Host 'Copy it to separately protected/offline storage. A second folder on the same disk is not disaster recovery.'
} finally { $taskPassword = $null }
