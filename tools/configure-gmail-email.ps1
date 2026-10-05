[CmdletBinding()]
param(
    [string]$SenderAddress,
    [string]$ApplicationUrl = 'https://localhost:57251'
)

$ErrorActionPreference = 'Stop'
$serverProject = Join-Path (Split-Path -Parent $PSScriptRoot) 'BudgetApp\BudgetApp.Server\BudgetApp.Server.csproj'
if (-not (Test-Path -LiteralPath $serverProject -PathType Leaf)) {
    throw 'BudgetApp.Server.csproj was not found relative to this setup script.'
}
if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    throw 'Install the .NET SDK or run this from Developer PowerShell.'
}

if ([string]::IsNullOrWhiteSpace($SenderAddress)) {
    $SenderAddress = Read-Host 'New MC Budget Gmail address'
}
$SenderAddress = $SenderAddress.Trim()
if ($SenderAddress -notmatch '^[^\s<>@]+@gmail\.com$') {
    throw 'Enter the full dedicated @gmail.com address.'
}
$applicationUri = $null
if (-not [Uri]::TryCreate($ApplicationUrl, [UriKind]::Absolute, [ref]$applicationUri) -or
    $applicationUri.Scheme -ne 'https' -or $applicationUri.UserInfo -or
    $applicationUri.Query -or $applicationUri.Fragment) {
    throw 'ApplicationUrl must be a clean HTTPS URL for the frontend you will open.'
}

Write-Host 'This enables real outgoing email in Development, including recovery and invitations.'
Write-Host 'Enter the Google app password, not the normal Google account password.'
$appPassword = Read-Host 'BudgetApp app password (hidden)' -AsSecureString
$smtpCredential = [System.Management.Automation.PSCredential]::new($SenderAddress, $appPassword)
$emailSecrets = $null
$secretsJson = $null
try {
    $emailSecrets = @{
        'Email:DeliveryMode' = 'Smtp'
        'Email:SenderName' = 'MC Budget'
        'Email:SenderAddress' = $SenderAddress
        'Email:Smtp:Host' = 'smtp.gmail.com'
        'Email:Smtp:Port' = '587'
        'Email:Smtp:Security' = 'StartTls'
        'Email:Smtp:Username' = $SenderAddress
        'Email:Smtp:Password' = $smtpCredential.GetNetworkCredential().Password.Replace(' ', '')
        'Email:Smtp:TimeoutSeconds' = '30'
        'Application:PublicBaseUrl' = $ApplicationUrl
    }
    if ($emailSecrets['Email:Smtp:Password'] -notmatch '^[a-zA-Z0-9]{16}$') {
        throw 'Expected a 16-character Google app password (spaces are removed automatically).'
    }
    $secretsJson = $emailSecrets | ConvertTo-Json -Compress
    # Pass secrets via stdin, never command-line arguments or a repository file.
    $secretsJson | & dotnet user-secrets set --project $serverProject
    if ($LASTEXITCODE -ne 0) {
        throw 'The .NET user-secrets command failed.'
    }
}
finally {
    $emailSecrets = $null
    $secretsJson = $null
    $smtpCredential = $null
    $appPassword.Dispose()
}

Write-Host 'Gmail settings saved to Development user secrets. Existing database settings were preserved.'
Write-Host 'Restart BudgetApp, then request password recovery for an existing Development account.'
Write-Host 'Your account setup is saved; actual SMTP login and inbox delivery still need that test.'
