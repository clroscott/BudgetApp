[CmdletBinding()]
param(
    [string]$SenderAddress,
    [Parameter(Mandatory = $true)][string]$ApplicationUrl,
    [string]$CredentialPath = 'C:\Apps\BudgetApp\secrets\gmail.credential'
)

. (Join-Path $PSScriptRoot 'KeyRing-Windows.Common.ps1')
if ($env:OS -ne 'Windows_NT' -or $PSVersionTable.PSVersion.Major -ne 5) {
    throw 'Run the .cmd wrapper under the same Windows account that starts Production (Windows PowerShell 5.1).'
}

$taskApplicationUri = $null
if ($ApplicationUrl -match '[\r\n\x00]' -or
    -not [Uri]::TryCreate($ApplicationUrl, [UriKind]::Absolute, [ref]$taskApplicationUri) -or
    $taskApplicationUri.Scheme -ne 'https' -or $taskApplicationUri.UserInfo -or
    $taskApplicationUri.Query -or $taskApplicationUri.Fragment) {
    throw 'ApplicationUrl must be a clean HTTPS frontend URL recipients can reach.'
}
$ApplicationUrl = $taskApplicationUri.AbsoluteUri.TrimEnd('/')
$taskCredentialPath = Resolve-KeyRingPath $CredentialPath
if ([IO.Path]::GetExtension($taskCredentialPath) -ne '.credential') {
    throw 'Use a .credential file outside source control and the publish directory.'
}
$taskParent = Split-Path -Parent $taskCredentialPath
if (-not (Test-Path -LiteralPath $taskParent -PathType Container)) {
    throw 'The credential parent directory must already exist. Use the existing Production secrets directory.'
}
for ($taskAncestor = $taskParent; $taskAncestor; $taskAncestor = Split-Path -Parent $taskAncestor) {
    if ((Test-Path -LiteralPath (Join-Path $taskAncestor 'BudgetApp.Server.exe')) -or
        (Test-Path -LiteralPath (Join-Path $taskAncestor 'BudgetApp.Server.dll'))) {
        throw 'Credentials must not be stored inside an application publish directory.'
    }
}
if (Test-Path -LiteralPath $taskCredentialPath) {
    throw 'Credential file already exists. Nothing was overwritten. Use a new filename for an intentional credential replacement.'
}

if ([string]::IsNullOrWhiteSpace($SenderAddress)) {
    $SenderAddress = Read-Host 'Dedicated MC Budget Gmail address (same account as Development)'
}
$SenderAddress = $SenderAddress.Trim()
if ($SenderAddress -notmatch '^[^\s<>@]+@gmail\.com$') {
    throw 'Enter the full dedicated @gmail.com address.'
}

Write-Host 'Run as the same normal Windows account that starts Production.'
Write-Host 'Enter the Google app password, not the normal Google account password. Do not paste it into chat.'
Write-Host 'This saves a local Windows-protected SMTP credential; it does not send email, start the app, or change your database/keys/startup file.'
$taskAppPassword = $null
$taskNormalizedPassword = $null
$taskCredential = $null
$taskImportedCredential = $null
$taskPlainPassword = $null
try {
    $taskAppPassword = Read-Host 'Google app password (hidden)' -AsSecureString
    $taskCredential = [Management.Automation.PSCredential]::new($SenderAddress, $taskAppPassword)
    $taskPlainPassword = $taskCredential.GetNetworkCredential().Password.Replace(' ', '')
    if ($taskPlainPassword -notmatch '^[a-zA-Z0-9]{16}$') {
        throw 'Expected a 16-character Google app password; grouping spaces are removed automatically.'
    }
    $taskNormalizedPassword = ConvertTo-SecureString $taskPlainPassword -AsPlainText -Force
    $taskCredential = [Management.Automation.PSCredential]::new($SenderAddress, $taskNormalizedPassword)
    $taskPlainPassword = $null

    # Reserve a NEW file atomically, then restrict its DACL before serialization.
    # Existing credentials are never overwritten, including on a failed rerun.
    $taskStream = [IO.File]::Open($taskCredentialPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $taskStream.Dispose()
    Set-KeyRingRestrictedAcl -Path $taskCredentialPath
    $taskCredential | Export-Clixml -LiteralPath $taskCredentialPath
    $taskImportedCredential = Import-Clixml -LiteralPath $taskCredentialPath
    if ($taskImportedCredential -isnot [Management.Automation.PSCredential] -or
        $taskImportedCredential.UserName -ne $SenderAddress -or
        $taskImportedCredential.GetNetworkCredential().Password -ne $taskCredential.GetNetworkCredential().Password) {
        throw 'The Windows-protected credential could not be verified. Stop and inspect the new file; do not start Production.'
    }
} finally {
    $taskPlainPassword = $null
    $taskCredential = $null
    if ($taskImportedCredential -is [Management.Automation.PSCredential]) { $taskImportedCredential.Password.Dispose() }
    $taskImportedCredential = $null
    if ($taskNormalizedPassword) { $taskNormalizedPassword.Dispose() }
    if ($taskAppPassword) { $taskAppPassword.Dispose() }
}

$taskQuotedPath = $taskCredentialPath.Replace("'", "''")
$taskQuotedUrl = $ApplicationUrl.Replace("'", "''")
Write-Host 'SAVED: protected SMTP credential round-trip verified. Real SMTP delivery still needs an app test.'
Write-Host ('Credential file: ' + $taskCredentialPath)
Write-Host 'Replace the old File-email block in the Production startup file with the following. Keep database, HTTPS, and Data Protection settings unchanged:'
Write-Output @"
`$taskGmailCredential = Import-Clixml -LiteralPath '$taskQuotedPath' -ErrorAction Stop
if (`$taskGmailCredential -isnot [Management.Automation.PSCredential]) { throw 'The Gmail credential is invalid. Do not start Production.' }
try {
    `$env:Email__DeliveryMode = 'Smtp'
    `$env:Email__SenderName = 'MC Budget'
    `$env:Email__SenderAddress = `$taskGmailCredential.UserName
    `$env:Email__Smtp__Host = 'smtp.gmail.com'
    `$env:Email__Smtp__Port = '587'
    `$env:Email__Smtp__Security = 'StartTls'
    `$env:Email__Smtp__Username = `$taskGmailCredential.UserName
    `$env:Email__Smtp__Password = `$taskGmailCredential.GetNetworkCredential().Password
    `$env:Email__Smtp__TimeoutSeconds = '30'
    `$env:Application__PublicBaseUrl = '$taskQuotedUrl'
} finally {
    `$taskGmailCredential.Password.Dispose()
    `$taskGmailCredential = `$null
}
"@
Write-Host 'This credential is tied to this Windows account and computer; provision it again if either changes. Keep it out of Git/publish and shared output.'
Write-Host 'A failed save can leave a new partial protected file. Stop and inspect it; never overwrite it as a retry shortcut.'
