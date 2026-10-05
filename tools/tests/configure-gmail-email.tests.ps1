$ErrorActionPreference = 'Stop'
$setupScript = Join-Path (Split-Path -Parent $PSScriptRoot) 'configure-gmail-email.ps1'
$gmailSetupTestCapture = [PSCustomObject]@{ Json = $null; Arguments = $null }

# Mock only the CLI and hidden prompt; never access the user's real secret store.
function dotnet {
    $gmailSetupTestCapture.Arguments = $args
    $gmailSetupTestCapture.Json = $input | Out-String
    $global:LASTEXITCODE = 0
}

function Read-Host {
    param([string]$Prompt, [switch]$AsSecureString)
    if (-not $AsSecureString) { throw 'The app password was not requested with a hidden prompt.' }
    return ConvertTo-SecureString 'abcd efgh ijkl mnop' -AsPlainText -Force
}

$originalDirectory = Get-Location
try {
    Set-Location ([System.IO.Path]::GetTempPath())
    & $setupScript -SenderAddress 'mc-budget-test@gmail.com' -ApplicationUrl 'https://localhost:57251'
    $captured = $gmailSetupTestCapture.Json | ConvertFrom-Json
    if ($captured.'Email:Smtp:Password' -ne 'abcdefghijklmnop' -or
        $captured.'Email:Smtp:Username' -ne 'mc-budget-test@gmail.com' -or
        $captured.'Email:DeliveryMode' -ne 'Smtp' -or
        $captured.'Application:PublicBaseUrl' -ne 'https://localhost:57251') {
        throw 'The setup settings were not passed correctly through stdin.'
    }
    if ($gmailSetupTestCapture.Json -match 'ConnectionStrings') {
        throw 'The script attempted to replace database secrets.'
    }
    $projectArgument = [string]$gmailSetupTestCapture.Arguments[-1]
    if (-not (Test-Path -LiteralPath $projectArgument -PathType Leaf)) {
        throw 'The project path did not resolve independently of the working directory.'
    }
    foreach ($arguments in @(
        @{ SenderAddress = 'invalid'; ApplicationUrl = 'https://localhost:57251' },
        @{ SenderAddress = 'mc-budget-test@gmail.com'; ApplicationUrl = 'http://localhost:57251' },
        @{ SenderAddress = 'mc-budget-test@gmail.com'; ApplicationUrl = 'https://localhost/?token=private' }
    )) {
        $rejected = $false
        try { & $setupScript @arguments } catch { $rejected = $true }
        if (-not $rejected) { throw 'Invalid configuration was not rejected.' }
    }
    Write-Host 'Gmail setup script checks passed; no real secrets were read or written.'
}
finally {
    Set-Location $originalDirectory
}
