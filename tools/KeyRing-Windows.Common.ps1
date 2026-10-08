Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Native child processes can inherit PowerShell 7 module paths. Load the security
# module belonging to THIS host, never a different host's assembly/type data.
if ($env:OS -eq 'Windows_NT') {
    Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1') -ErrorAction Stop
}

function Assert-KeyRingWindows {
    if ($env:OS -ne 'Windows_NT') { throw 'These key-ring tools support the current Windows deployment only.' }
    if ($PSVersionTable.PSVersion.Major -ne 5) { throw 'Run the .cmd wrapper (Windows PowerShell 5.1), or invoke this script in Windows PowerShell 5.1.' }
    Import-Module (Join-Path $PSHOME 'Modules\PKI\PKI.psd1') -ErrorAction Stop
}

function Resolve-KeyRingPath([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path) -or $Path -notmatch '^[A-Za-z]:[\\/].+' -or $Path.StartsWith('\\')) {
        throw 'Use an absolute local path, not a network share.'
    }
    $taskFullPath = [IO.Path]::GetFullPath($Path).TrimEnd('\')
    if ($taskFullPath -eq [IO.Path]::GetPathRoot($taskFullPath).TrimEnd('\')) { throw 'A drive root is not a permitted target.' }
    $taskSourceRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot)).TrimEnd('\')
    if ($taskFullPath -eq $taskSourceRoot -or $taskFullPath.StartsWith($taskSourceRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Key material and recovery packages must remain outside the repository.'
    }
    $taskAncestor = $taskFullPath
    while ($taskAncestor) {
        if (Test-Path -LiteralPath $taskAncestor) {
            $taskItem = Get-Item -LiteralPath $taskAncestor -Force
            if ($taskItem.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Symbolic links/junctions are not permitted.' }
            if (Test-Path -LiteralPath (Join-Path $taskAncestor '.git')) { throw 'A Git checkout is not a permitted location.' }
        }
        $taskAncestor = Split-Path -Parent $taskAncestor
    }
    return $taskFullPath
}

function Set-KeyRingRestrictedAcl([string]$Path, [switch]$Directory) {
    $taskSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $taskAllowedSids = @($taskSid.Value, 'S-1-5-18', 'S-1-5-32-544')
    $taskExistingAcl = Get-Acl -LiteralPath $Path
    $taskOwnerSid = $taskExistingAcl.GetOwner([Security.Principal.SecurityIdentifier]).Value
    if ($taskOwnerSid -notin $taskAllowedSids) {
        throw 'The existing owner is not the app-running identity, SYSTEM, or local Administrators. Stop and review the Windows identity/ownership; this helper does not take ownership.'
    }
    if ($Directory) {
        $taskAcl = New-Object Security.AccessControl.DirectorySecurity
        $taskInheritance = [Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'
    } else {
        $taskAcl = New-Object Security.AccessControl.FileSecurity
        $taskInheritance = [Security.AccessControl.InheritanceFlags]::None
    }
    $taskAcl.SetAccessRuleProtection($true, $false)
    foreach ($taskAllowedSid in $taskAllowedSids) {
        $taskIdentity = New-Object Security.Principal.SecurityIdentifier($taskAllowedSid)
        $taskRule = New-Object Security.AccessControl.FileSystemAccessRule($taskIdentity, 'FullControl', $taskInheritance, 'None', 'Allow')
        $taskAcl.AddAccessRule($taskRule)
    }
    # Persist only the DACL; preserve the Windows-assigned owner. An owner can
    # change permissions without WRITE_OWNER, so even resetting the same owner
    # can fail on an otherwise writable folder/private-key file. Set-Acl can
    # also attempt privileged SACL writes that are not needed here.
    if ($Directory) {
        ([IO.DirectoryInfo]::new($Path)).SetAccessControl($taskAcl)
    } else {
        ([IO.FileInfo]::new($Path)).SetAccessControl($taskAcl)
    }
}

function Normalize-KeyRingThumbprint([string]$Thumbprint) {
    $taskThumbprint = $Thumbprint.Replace(' ', '').ToUpperInvariant()
    if ($taskThumbprint -notmatch '^[0-9A-F]{40}$') { throw 'Invalid certificate thumbprint.' }
    return $taskThumbprint
}

function Get-KeyRingCertificate([string]$Thumbprint) {
    $taskThumbprint = Normalize-KeyRingThumbprint $Thumbprint
    $taskCertPath = 'Cert:\CurrentUser\My\' + $taskThumbprint
    if (-not (Test-Path -LiteralPath $taskCertPath)) { throw 'Dedicated certificate is not in the current Windows user certificate store.' }
    $taskCertificate = Get-Item -LiteralPath $taskCertPath
    if (-not $taskCertificate.HasPrivateKey) { throw 'The certificate private key is missing.' }
    return $taskCertificate
}

function Protect-KeyRingCertificate($Certificate) {
    $taskRsa = [Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($Certificate)
    try {
        if ($taskRsa -isnot [Security.Cryptography.RSACng] -or $taskRsa.Key.IsMachineKey) {
            throw 'Use a CurrentUser RSA certificate from Microsoft Software Key Storage Provider.'
        }
        $taskPrivateKeyPath = Join-Path ([Environment]::GetFolderPath('ApplicationData')) ('Microsoft\Crypto\Keys\' + $taskRsa.Key.UniqueName)
        if (-not (Test-Path -LiteralPath $taskPrivateKeyPath -PathType Leaf)) { throw 'Cannot locate the certificate private-key file.' }
        Set-KeyRingRestrictedAcl -Path $taskPrivateKeyPath
    } finally { if ($taskRsa) { $taskRsa.Dispose() } }
}

function New-KeyRingCertificate {
    $taskNewCertificate = New-SelfSignedCertificate -Subject 'CN=BudgetApp Production Data Protection' `
        -FriendlyName 'BudgetApp Production Data Protection (not HTTPS)' -Type Custom `
        -CertStoreLocation 'Cert:\CurrentUser\My' -Provider 'Microsoft Software Key Storage Provider' `
        -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -KeyExportPolicy Exportable `
        -KeyUsage KeyEncipherment,DataEncipherment,DigitalSignature -NotAfter (Get-Date).AddYears(3)
    Protect-KeyRingCertificate $taskNewCertificate
    return $taskNewCertificate
}

function Invoke-KeyRingCommand([string]$Executable, [string]$KeyRingPath, [string]$Thumbprint,
    [string[]]$RetainedThumbprints, [string]$Operation, [string]$ProbeFile) {
    $taskSettings = @{
        'ASPNETCORE_ENVIRONMENT' = 'Production'
        'DOTNET_ENVIRONMENT' = 'Production'
        'DataProtection__KeyRingPath' = $KeyRingPath
        'DataProtection__CertificateThumbprint' = $Thumbprint
    }
    $taskSaved = @{}
    # Do not inherit a different deployment's retained-certificate list.
    foreach ($taskVariable in [Environment]::GetEnvironmentVariables('Process').Keys) {
        if ($taskVariable -like 'DataProtection__DecryptionCertificateThumbprints__*') { $taskSaved[$taskVariable] = [Environment]::GetEnvironmentVariable($taskVariable, 'Process') }
    }
    $taskIndex = 0
    foreach ($taskRetained in @($RetainedThumbprints)) {
        if ($taskRetained) { $taskSettings['DataProtection__DecryptionCertificateThumbprints__' + $taskIndex] = $taskRetained; $taskIndex++ }
    }
    foreach ($taskSetting in $taskSettings.Keys) { $taskSaved[$taskSetting] = [Environment]::GetEnvironmentVariable($taskSetting, 'Process') }
    try {
        foreach ($taskVariable in @($taskSaved.Keys)) { [Environment]::SetEnvironmentVariable($taskVariable, $null, 'Process') }
        foreach ($taskSetting in $taskSettings.Keys) { [Environment]::SetEnvironmentVariable($taskSetting, $taskSettings[$taskSetting], 'Process') }
        $taskArguments = @('--key-ring', $Operation)
        if ($ProbeFile) { $taskArguments += @('--probe-file', $ProbeFile) }
        & $Executable @taskArguments
        if ($LASTEXITCODE -ne 0) { throw 'Key-ring command failed. Do not bypass the error or reinitialize an existing installation.' }
    } finally {
        foreach ($taskSetting in $taskSettings.Keys) { [Environment]::SetEnvironmentVariable($taskSetting, $null, 'Process') }
        foreach ($taskSetting in $taskSaved.Keys) { [Environment]::SetEnvironmentVariable($taskSetting, $taskSaved[$taskSetting], 'Process') }
    }
}

function Assert-KeyRingExecutable([string]$Executable, [string]$Target) {
    $taskExecutable = [IO.Path]::GetFullPath($Executable)
    if (-not (Test-Path -LiteralPath $taskExecutable -PathType Leaf)) { throw 'Build/publish the reviewed new server first and supply its BudgetApp.Server.exe path.' }
    $taskPublish = Split-Path -Parent $taskExecutable
    if ($Target -eq $taskPublish -or $Target.StartsWith($taskPublish + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Key/recovery targets must be outside the publish folder.'
    }
    return $taskExecutable
}
