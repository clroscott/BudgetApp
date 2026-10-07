[CmdletBinding()]
param()
. (Join-Path $PSScriptRoot 'KeyRing-Windows.Common.ps1')
Assert-KeyRingWindows
Write-Host 'Create a dedicated replacement wrapping certificate as the same Windows account that runs Production.'
Write-Host 'This does not change the ring or startup script, delete the old certificate, or rotate HTTPS.'
if ((Read-Host 'Type NEW KEY CERTIFICATE to continue') -cne 'NEW KEY CERTIFICATE') { throw 'Canceled. Nothing was changed.' }
$taskCertificate = New-KeyRingCertificate
Write-Host ('New certificate thumbprint: ' + $taskCertificate.Thumbprint)
Write-Host ('Expires: ' + $taskCertificate.NotAfter.ToString('yyyy-MM-dd'))
Write-Host 'Retain ALL old wrapping certificates; add their thumbprints to DecryptionCertificateThumbprints before switching the current thumbprint.'
Write-Host 'Follow docs/production-key-storage.md: restart/check, then take a new protected backup and rehearse restore.'
