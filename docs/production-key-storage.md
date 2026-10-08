# Windows Production key storage and recovery (#150)

## What is protected

ASP.NET Data Protection protects authentication and pending-MFA cookies,
antiforgery values, Identity password-reset/email-confirmation/email-change
tokens, and the stored encrypted email-MFA codes. It is not financial-database
encryption (#151), password hashing, or the MFA recovery codes users save.

This baseline targets the current single-Windows-computer installation. It does
not authorize public internet exposure. Host-specific storage, workload identity,
replicas, and disaster recovery are tracked separately in
[#204](https://github.com/clroscott/BudgetApp/issues/204), after the hosting choice
under #107.

## Storage and identity

| Environment | Storage | Protection / application discriminator |
| --- | --- | --- |
| Development | User local-app-data `BudgetApp\DataProtection\Development` | Windows current-user DPAPI / `BudgetApp.Development.v1` |
| Scratch | User local-app-data `BudgetApp\DataProtection\Scratch` | Windows current-user DPAPI / `BudgetApp.Scratch.v1` |
| Testing | Ephemeral provider; no default filesystem writes | `BudgetApp.Testing.v1`; automated persistence tests use temporary rings |
| Production | Explicit absolute directory outside publish/Git | Dedicated CurrentUser/My RSA certificate / `BudgetApp.Production.v1` |

Development/Scratch deliberately ignore all inherited `DataProtection:*`
Production settings. They cannot be redirected into the Production ring by the
startup environment. Non-Windows Development/Scratch use a local profile folder
without the Windows DPAPI layer: fictional data only, never Production keys.
Non-Windows Production refuses to start until a supported hosted provider is
implemented and verified. No home-directory root, network share, publish subtree,
Git checkout, junction, or symlink is an acceptable Production location.

Use the same non-elevated Windows account for setup and running Production. The
current installation is interactive; a future service should have a dedicated
identity. Changing identity requires explicitly importing decryption material
and setting permissions, not regenerating keys. An MC Budget application owner
or household administrator does not gain Windows key/certificate access.

The setup tools restrict the key directory and certificate private-key file to
the launching Windows identity, SYSTEM, and trusted local Administrators. These
OS administrators remain trusted operators; this does not defend against a
compromised host or application process with key access. Directory inheritance
is removed, and startup rejects broader allow permissions. Production also
requires an accessible current RSA certificate/private key, decryptable retained
keys, the initialization manifest, and create/write access. It does not silently
fall back to default/ephemeral/new keys when validation fails.

## First switch from the old implicit ring

Do not initialize while users are using Production. Build/publish a reviewed
release to a staging folder first; do not deploy over the running app.

Before switching, record the current launching Windows identity and existing
Data Protection storage location using safe startup diagnostics. With an
available Windows profile, the old framework default is commonly
`%LOCALAPPDATA%\ASP.NET\DataProtection-Keys`, but verify the actual installation.
Record the old application discriminator/content root for rollback. Keep the old
ring untouched in its existing protection context. Do not copy its decrypted XML
or assume DPAPI files alone can be restored on another machine.

The first switch uses a **new** Production ring and discriminator. Users must
sign in again. Outstanding Identity reset/confirmation/change-email links and
pending encrypted MFA challenges from the old context must be requested again;
refresh/reload clears obsolete antiforgery context. This is a planned one-time
transition, not a data migration. Subsequent releases keep the same ring/name.
Password hashes, financial records, confirmed-email status, MFA enrollment, and
hashed recovery-code records are not rewritten or deleted.

From the repository root, as the Windows account that runs Production:

```powershell
# Example staging path: replace with your actual reviewed package.
.\tools\Initialize-ProductionKeyRing.cmd `
  -ServerExecutable 'C:\Apps\BudgetApp\releases\new-release\BudgetApp.Server.exe'
```

The tool prints the target, asks `PREPARE KEYS`, creates a restricted NEW folder
and a separate exportable RSA-3072 encryption certificate (three-year lifetime),
then the offline server asks `INITIALIZE KEYS`. It refuses an existing directory,
never deletes/overwrites keys, and never starts a listener, accesses SQL, or sends
email. Cancellation/failure can leave the newly prepared folder/certificate;
inspect them rather than blindly rerunning. If a key was created but the manifest
could not be saved, do not initialize over it: review the incomplete first setup
before any deployment. Live/old rings are never removed automatically.

### Retry after a folder-permission setup failure

The permission helper preserves the existing trusted Windows owner and changes
only the access rules. It refuses ownership outside the app-running identity,
SYSTEM, or local Administrators rather than taking ownership. Folder/file
ownership changes require `WRITE_OWNER`, which is not
needed just to restrict access to a location the launching user already owns.
Regression tests cover owned folders and private-file fixtures with Modify access
and `WRITE_OWNER` denied, without requiring an elevated shell.

For a **confirmed initial folder-permission failure before certificate creation**,
use the corrected helper and preserve the EMPTY incomplete directory before
retrying. No application republish or database update is required for this helper
fix. Run as the same normal Windows account with Production still stopped:

```powershell
$taskFailedRingPath = 'C:\Apps\BudgetApp\data\protection-keys\production'
$taskFailedRing = Get-Item -LiteralPath $taskFailedRingPath -Force -ErrorAction Stop
if (-not $taskFailedRing.PSIsContainer -or
    $taskFailedRing.FullName -ne $taskFailedRingPath -or
    ($taskFailedRing.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
    @(Get-ChildItem -LiteralPath $taskFailedRingPath -Force -ErrorAction Stop).Count -ne 0) {
    throw 'Stop: this is not the expected empty incomplete directory. Do not rename or reinitialize existing key material.'
}
$taskPreservedName = 'production-incomplete-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
$taskPreservedPath = Join-Path $taskFailedRing.Parent.FullName $taskPreservedName
if (Test-Path -LiteralPath $taskPreservedPath) { throw 'Preservation destination already exists.' }
Rename-Item -LiteralPath $taskFailedRingPath -NewName $taskPreservedName -ErrorAction Stop

.\tools\Initialize-ProductionKeyRing.cmd `
  -ServerExecutable 'C:\Apps\BudgetApp\publish\BudgetApp.Server.exe'
```

The old empty directory is retained as `production-incomplete-<timestamp>`; no
keys are deleted or overwritten. The initializer still refuses any existing
destination. If setup progressed to certificate/key creation, the directory is
nonempty, or the failure stage is uncertain, stop and inspect instead of using
this retry procedure. Never use it to replace an established ring.

### Configure the Production startup

The tool prints two non-secret startup settings. Add them to your existing
process-scoped Production startup procedure (substitute the actual thumbprint):

```powershell
$env:DataProtection__KeyRingPath = 'C:\Apps\BudgetApp\data\protection-keys\production'
$env:DataProtection__CertificateThumbprint = '<40-character certificate thumbprint>'
```

No certificate password is needed at runtime: the private key is in the running
user's Windows certificate store and protected by Windows permissions. This
certificate is separate from `budgetapp.p12` used for HTTPS and needs no public
domain or certificate authority. Its thumbprint is not a secret. Never export a
private key into the repository, publish folder, an issue, or a chat.

## Check, back up, and rehearse restore

All examples use placeholder paths; choose an actual staged server and a NEW
backup/rehearsal directory outside publish/Git. `.cmd` wrappers permit only their
child Windows PowerShell 5.1 invocation; no permanent execution-policy change is
needed. The PKI scripts deliberately require this host, not PowerShell 7.
They explicitly load this host's modules, restrict access permissions while
preserving ownership, and do not make privileged system-audit ACL changes.

```powershell
.\tools\Test-ProductionKeyRing.cmd `
  -ServerExecutable 'C:\Apps\BudgetApp\releases\new-release\BudgetApp.Server.exe' `
  -CertificateThumbprint '<thumbprint>'

# Stop BudgetApp first for a consistent backup, including rotation metadata.
.\tools\Backup-ProductionKeyRing.cmd `
  -ServerExecutable 'C:\Apps\BudgetApp\releases\new-release\BudgetApp.Server.exe' `
  -CertificateThumbprint '<thumbprint>' `
  -Destination 'D:\BudgetAppRecovery\keys-<unique-date>'

# Rehearsal: NEVER target or overwrite the live key directory.
.\tools\Restore-ProductionKeyRing.cmd `
  -ServerExecutable 'C:\Apps\BudgetApp\releases\new-release\BudgetApp.Server.exe' `
  -BackupDirectory 'D:\BudgetAppRecovery\keys-<unique-date>' `
  -Destination 'C:\Apps\BudgetApp\data\key-recovery-rehearsal-<unique-date>'
```

Backup requires confirmation and a strong password of at least 16 characters;
use a generated password saved separately in a password manager. It copies the
entire encrypted XML ring, revocation files, initialization manifest, a protected
recovery probe, and password-encrypted PKCS#12 exports of the current and ALL
retained decryption certificates. The probe is generated before copying keys so
any rotation it triggers is included. File hashes detect missing/corrupted files;
they are not a signature or protection against an attacker replacing a package.
Accept recovery packages only from trusted, access-controlled backup storage.

The ring XML stays certificate-encrypted. PFX private keys use password-based
encryption. Also keep the package on encrypted, restricted, separately protected
offline/off-machine storage. A sibling folder on the same disk is not disaster
recovery. Keep the export password separate; losing it and the running identity's
private key can make recovery impossible.

Restore verifies listed filenames/hashes, imports missing certificates into the
current user's store, applies restricted permissions to newly imported keys,
copies into a NEW directory, validates every key, and decrypts the pre-backup
probe. Existing certificate/private-key permissions are not rewritten during an
on-host rehearsal. Every PFX export and the password are checked even if the
certificate is already installed. Restore never changes the startup script, live ring, database,
or email state. A bad backup/import/check can leave partial new recovery artifacts;
stop and inspect them. Do not treat a failed operation as a verified backup.

An on-host rehearsal can reuse already installed certificates. To prove portable
certificate recovery, also test on a separate trusted Windows account/computer
that does not already possess them. No live Production database is needed for
the offline probe. Full user-flow testing uses an isolated application and
fictional database/email configuration, never a second instance with the live DB.

After a REAL recovery, separately review the restored ring path, current and
retained certificate thumbprints, application name, launching identity, and
permissions. Run the offline check and app smoke tests before reopening access.
Never restore by overwriting an active ring. Use a maintenance window and select
the validated recovery directory explicitly in startup configuration.

## Rotation, retention, and compromise

- Data Protection uses its framework 90-day automatic key lifetime. An expired
  protection key remains available for old protected values; their original token
  and cookie expiry still applies. Rotation does not extend those lifetimes.
- Keep all old key and revocation XML plus the anchor manifest. No age-based
  deletion is performed. The anchor key is required to validate ring continuity.
- Monitor the dedicated certificate's expiry and plan replacement BEFORE expiry.
  New-key protection uses `CertificateThumbprint`; old certificates remain in
  CurrentUser/My and in `DecryptionCertificateThumbprints` while any retained key
  needs them. Expired retained certificates may decrypt; the current wrapping
  certificate must be valid. Retain old private keys and export them in backups.
- For a wrapping-certificate replacement, run `tools\New-ProductionKeyCertificate.cmd`
  as the same Windows identity. It creates only a new restricted dedicated
  certificate and prints its thumbprint; it does not change the ring/startup or
  delete the old certificate. Add the old thumbprint
  to the retained list, switch the current thumbprint, restart/check, and take a
  new verified backup. Do not rerun initialization or reuse the HTTPS certificate.
  Newly generated protection keys use the new certificate; existing key files
  are not automatically re-encrypted. Unattended certificate renewal is deferred.
- Pass `-DecryptionCertificateThumbprints @('<old-1>', '<old-2>')` to the PowerShell
  check/backup tools after certificate rotation. In startup configuration use
  `$env:DataProtection__DecryptionCertificateThumbprints__0 = '<old-1>'`, etc.
  Use direct `.ps1` invocation in Windows PowerShell 5.1 for arrays (or its
  process-scoped bypass invocation);
  `cmd` does not have PowerShell array semantics.
- A compromise is NOT ordinary rotation. Stop access, preserve incident evidence,
  replace compromised protection material, and deliberately invalidate/reissue
  affected cookies and links. Revoking the manifest's anchor deliberately stops
  continuity validation; do not undo revocation just to make startup pass.
  Reestablishing a ring after compromise is a reviewed incident operation, not a
  button for household/application administrators.
- Do not silently remove old keys/certificates during deployment, certificate
  expiry, account changes, or disk cleanup. Store backups after first setup, after
  key/certificate changes, and as a recurring operational responsibility; keep
  previous verified recovery sets until a newer restore rehearsal succeeds.

## Failure and rollback consequences

Missing keys/certificate, broader ACLs, tampered manifest, unreadable retained
keys, or wrong application name stop Production startup before requests or owner
bootstrap are served. Restore the intended material; do not generate a fresh
ring as a troubleshooting shortcut. Maintenance checks perform a disposable
directory write-access probe and may load the framework key ring; write-probe
explicitly protects a new diagnostic value and can trigger normal rotation.

Key loss affects cookies, antiforgery context, Identity links, and encrypted MFA
challenges. It does not delete budgets/transactions, user password hashes,
verification status, MFA settings, or hashed recovery codes. Existing MFA recovery
codes still require the normal password and new pending-login flow. Invitation
and operator-MFA-recovery link tokens are random hashed database tokens, not
Identity Data Protection tokens; their own expiry/replay rules remain unchanged.

Code rollback to a release BEFORE this baseline uses the old implicit ring and
content-root discriminator; do not assume it understands new cookies/links.
Users will need fresh logins/links in that context too. Returning to the new
release uses the preserved explicit ring. Never roll back the ring by deleting
newer keys: backups predating a rotated key cannot decrypt values protected by it.
Database rollback is a separate decision and procedure.

## Evidence and remaining checks

Automated tests use disposable rings and in-memory test certificates (no real
certificate-store imports, Production files, SQL Server, or mail delivery).
They cover encrypted persistence, restart, cookie/MFA/antiforgery and Identity
tokens, isolated restore with exported decryption material, environment isolation,
rotation/retained certificates, missing/empty/partial/corrupt rings, manifest
continuity, unsafe paths, Windows broad permissions, and non-overwrite behavior.
Windows helper coverage also checks directory/private-file permissions without
WRITE_OWNER, ownership preservation, unsafe-path rejection, and restoration of
process settings after a command fails.

Complete the permanent key-storage cases in
[Manual QA](manual-qa-regression-test-plan.md) before deploying. Record the actual
Windows identity, paths, ACL result, certificate expiry, backup location, and
restore evidence OUTSIDE source control; never record passwords/key XML/tokens.
The scripts are not proof that your actual installation has been configured or
restored. Future internet hosting remains #204 and other public-launch gates.

## Primary references

- [Microsoft: Data Protection configuration](https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/configuration/overview?view=aspnetcore-10.0)
- [Microsoft: key encryption at rest](https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/implementation/key-encryption-at-rest?view=aspnetcore-10.0)
- [Microsoft: key lifetime and retention](https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/configuration/default-settings?view=aspnetcore-10.0)
