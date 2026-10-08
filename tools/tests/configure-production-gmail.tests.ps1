$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT' -or $PSVersionTable.PSVersion.Major -ne 5) {
    throw 'These credential tests require Windows PowerShell 5.1.'
}
$taskScript = Join-Path (Split-Path -Parent $PSScriptRoot) 'Configure-ProductionGmail.ps1'
$taskTestRoot = Join-Path ([IO.Path]::GetTempPath()) ('BudgetApp-GmailTests-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskTestRoot | Out-Null
$taskTestState = [pscustomobject]@{ PromptCount = 0; Password = 'abcd efgh ijkl mnop' }
function Read-Host {
    param([string]$Prompt, [switch]$AsSecureString)
    if (-not $AsSecureString) { throw 'Test password was not requested with a hidden prompt.' }
    $taskTestState.PromptCount++
    ConvertTo-SecureString $taskTestState.Password -AsPlainText -Force
}
function Assert-RejectedProductionGmailSetup([hashtable]$Parameters) {
    $taskRejected = $false
    try { & $taskScript @Parameters *> $null } catch { $taskRejected = $true }
    if (-not $taskRejected) { throw 'Unsafe configuration was accepted.' }
}

try {
    # Real Windows DPAPI round-trip, with fictional credentials only. No SMTP,
    # certificate-store, Development secrets, or Production paths are accessed.
    $taskPath = Join-Path $taskTestRoot "fictional'credential.credential"
    $taskArguments = @{ SenderAddress = 'fictional-test@gmail.com'; ApplicationUrl = 'https://mcbudgetapp'; CredentialPath = $taskPath }
    $taskOutput = (& $taskScript @taskArguments *>&1 | Out-String)
    if ($taskOutput -match 'abcdefghijklmnop|abcd efgh ijkl mnop') { throw 'Password leaked in setup output.' }
    if ($taskOutput -notmatch 'SAVED: protected SMTP credential round-trip verified') { throw 'Save success was not reported.' }
    $taskSaved = Import-Clixml -LiteralPath $taskPath
    try {
        if ($taskSaved.UserName -ne 'fictional-test@gmail.com' -or $taskSaved.GetNetworkCredential().Password -ne 'abcdefghijklmnop') { throw 'Credential round-trip failed.' }
    } finally { $taskSaved.Password.Dispose(); $taskSaved = $null }
    if ((Get-Content -LiteralPath $taskPath -Raw) -match 'abcdefghijklmnop') { throw 'Credential was stored as plaintext.' }
    $taskAcl = Get-Acl -LiteralPath $taskPath
    $taskSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $taskRules = @($taskAcl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
    if (-not $taskAcl.AreAccessRulesProtected -or $taskRules.Count -ne 3) { throw 'Credential ACL was not restricted.' }
    foreach ($taskRule in $taskRules) {
        if ($taskRule.IdentityReference.Value -notin @($taskSid, 'S-1-5-18', 'S-1-5-32-544') -or $taskRule.AccessControlType -ne 'Allow' -or $taskRule.FileSystemRights -ne 'FullControl') { throw 'Unexpected credential access grant.' }
    }
    $taskBeforeContents = [IO.File]::ReadAllText($taskPath)
    Assert-RejectedProductionGmailSetup $taskArguments
    if ([IO.File]::ReadAllText($taskPath) -ne $taskBeforeContents -or $taskTestState.PromptCount -ne 1) { throw 'Existing credential was changed or another password was requested.' }

    # Parse and apply the emitted startup block in this test process only.
    $taskBlock = [regex]::Match($taskOutput, '(?ms)^\$taskGmailCredential = Import-Clixml.*?^\} finally \{.*?^\}').Value
    if (-not $taskBlock) { throw 'Startup block was not found.' }
    $taskVariableNames = @('Email__DeliveryMode', 'Email__SenderName', 'Email__SenderAddress', 'Email__Smtp__Host', 'Email__Smtp__Port', 'Email__Smtp__Security', 'Email__Smtp__Username', 'Email__Smtp__Password', 'Email__Smtp__TimeoutSeconds', 'Application__PublicBaseUrl')
    $taskOriginalVariables = @{}
    foreach ($taskVariable in $taskVariableNames) { $taskOriginalVariables[$taskVariable] = [Environment]::GetEnvironmentVariable($taskVariable, 'Process') }
    try {
        & ([scriptblock]::Create($taskBlock))
        if ($env:Email__DeliveryMode -ne 'Smtp' -or $env:Email__Smtp__Host -ne 'smtp.gmail.com' -or $env:Email__Smtp__Port -ne '587' -or $env:Email__Smtp__Security -ne 'StartTls' -or $env:Email__Smtp__Password -ne 'abcdefghijklmnop' -or $env:Application__PublicBaseUrl -ne 'https://mcbudgetapp') { throw 'Emitted startup settings were incorrect.' }
    } finally {
        foreach ($taskVariable in $taskVariableNames) { [Environment]::SetEnvironmentVariable($taskVariable, $taskOriginalVariables[$taskVariable], 'Process') }
    }

    $taskMissingPath = Join-Path $taskTestRoot 'missing.credential'
    $taskMissingBlock = $taskBlock.Replace($taskPath.Replace("'", "''"), $taskMissingPath.Replace("'", "''"))
    $taskMissingRejected = $false
    try { & ([scriptblock]::Create($taskMissingBlock)) *> $null } catch { $taskMissingRejected = $true }
    if (-not $taskMissingRejected) { throw 'Startup did not stop on a missing credential.' }
    foreach ($taskVariable in $taskVariableNames) {
        if ([Environment]::GetEnvironmentVariable($taskVariable, 'Process') -ne $taskOriginalVariables[$taskVariable]) { throw 'Missing credential changed runtime settings.' }
    }

    $taskInvalidTarget = Join-Path $taskTestRoot 'invalid.credential'
    foreach ($taskUrl in @('http://mcbudgetapp', 'https://mcbudgetapp/?token=x', 'https://user:password@mcbudgetapp', 'https://mcbudgetapp/#fragment')) {
        Assert-RejectedProductionGmailSetup @{ SenderAddress = 'fictional-test@gmail.com'; ApplicationUrl = $taskUrl; CredentialPath = $taskInvalidTarget }
    }
    Assert-RejectedProductionGmailSetup @{ SenderAddress = 'invalid'; ApplicationUrl = 'https://mcbudgetapp'; CredentialPath = $taskInvalidTarget }
    Assert-RejectedProductionGmailSetup @{ SenderAddress = 'fictional-test@gmail.com'; ApplicationUrl = 'https://mcbudgetapp'; CredentialPath = (Join-Path $taskTestRoot 'wrong-extension.txt') }
    Assert-RejectedProductionGmailSetup @{ SenderAddress = 'fictional-test@gmail.com'; ApplicationUrl = 'https://mcbudgetapp'; CredentialPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'unsafe.credential') }
    $taskPublishDirectory = Join-Path $taskTestRoot 'fictional-publish'
    New-Item -ItemType Directory -Path $taskPublishDirectory | Out-Null
    New-Item -ItemType File -Path (Join-Path $taskPublishDirectory 'BudgetApp.Server.dll') | Out-Null
    Assert-RejectedProductionGmailSetup @{ SenderAddress = 'fictional-test@gmail.com'; ApplicationUrl = 'https://mcbudgetapp'; CredentialPath = (Join-Path $taskPublishDirectory 'unsafe.credential') }
    if ($taskTestState.PromptCount -ne 1) { throw 'Invalid configuration unexpectedly prompted for a password.' }
    $taskTestState.Password = 'not-a-valid-app-password'
    Assert-RejectedProductionGmailSetup @{ SenderAddress = 'fictional-test@gmail.com'; ApplicationUrl = 'https://mcbudgetapp'; CredentialPath = $taskInvalidTarget }
    if (Test-Path -LiteralPath $taskInvalidTarget) { throw 'Invalid password created a credential file.' }
    Write-Output 'Production Gmail setup checks passed; only fictional temporary credentials were used.'
} finally {
    $taskExpectedParent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if (-not [IO.Path]::GetFullPath($taskTestRoot).StartsWith($taskExpectedParent + 'BudgetApp-GmailTests-', [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe test cleanup path.' }
    Remove-Item -LiteralPath $taskTestRoot -Recurse -Force
}
