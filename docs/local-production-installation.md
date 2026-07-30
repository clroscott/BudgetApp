# Initial Local Production Installation

## Goal

This guide installs the published BudgetApp on one trusted Windows computer for local household use. The installed app:

- runs in the `Production` ASP.NET Core environment;
- uses the real local `BudgetAppDb` database;
- serves the compiled React client from ASP.NET Core;
- uses HTTPS with a locally supplied certificate;
- loads machine-specific values only into the launch process.

This is an **initial installation guide**, not an upgrade procedure. Once real data exists, do not replace the live application or apply a Production migration until the backup, migration, deployment, and rollback checklist has been completed.

## Safety Boundaries

- `BudgetAppDb` contains real household data.
- `BudgetAppDb_DEV` contains fictional development data.
- `BudgetAppDb_Scratch` is disposable.
- Production secrets, certificates, database backups, and real CSV files stay outside the repository.
- Production configuration is process-scoped. Do not persist `ConnectionStrings__BudgetApp` at User or Machine scope.
- Build into a staging folder first. Do not publish directly over the running app.

The Server refuses to run in Production unless the configured database is named exactly `BudgetAppDb`.

## Prerequisites

Complete [Clean Development Machine Setup](development-setup.md) first and confirm:

- `tools\verify-development-environment.cmd` reports `READY`;
- the full test suite passes;
- SQL Server is running;
- `BudgetAppDb` exists;
- `C:\Apps\BudgetApp\certs\budgetapp.p12` exists and is not tracked by Git;
- the Windows user launching BudgetApp can connect to `BudgetAppDb` with Integrated Security.

Recommended installation layout:

```text
C:\Apps\BudgetApp\
  certs\
    budgetapp.p12
  logs\
  publish\
  secrets\
    certificate.credential
```

The `publish` folder contains replaceable application binaries. The database, certificate, credential, and future backups are not stored inside it.

## 1. Verify the Source Revision

From the repository root:

```powershell
git status
git log -1 --oneline
.\tools\verify-development-environment.cmd
```

Record the commit ID being installed. Install only a reviewed, committed revision.

## 2. Build a Staged Production Package

Use an ignored repository artifact folder:

```powershell
dotnet publish `
    ".\BudgetApp\BudgetApp.Server\BudgetApp.Server.csproj" `
    --configuration Release `
    --output ".\artifacts\local-production-next"
```

Do not add `artifacts` to Git. The repository already ignores this directory.

Verify that both the server and compiled React application are present:

```powershell
.\tools\verify-local-production-package.cmd `
    ".\artifacts\local-production-next"
```

The verifier also rejects certificate, database, and backup file extensions inside the package.

## 3. Create the Installation Folders

For an initial installation:

```powershell
New-Item -ItemType Directory -Force "C:\Apps\BudgetApp\certs"
New-Item -ItemType Directory -Force "C:\Apps\BudgetApp\logs"
New-Item -ItemType Directory -Force "C:\Apps\BudgetApp\publish"
New-Item -ItemType Directory -Force "C:\Apps\BudgetApp\secrets"
```

Copy the staged package into the empty live publish folder:

```powershell
Copy-Item `
    ".\artifacts\local-production-next\*" `
    "C:\Apps\BudgetApp\publish" `
    -Recurse
```

For future upgrades, do not copy over the existing folder. Use the deployment and rollback checklist so stale binaries can be removed safely and the previous application revision remains recoverable.

## 4. Store the Certificate Password

Create the DPAPI-protected credential interactively. The password is not written into the command or repository:

```powershell
$certificatePassword = Read-Host `
    "Password for C:\Apps\BudgetApp\certs\budgetapp.p12" `
    -AsSecureString

$certificateCredential = [PSCredential]::new(
    "BudgetAppCertificate",
    $certificatePassword)

$certificateCredential |
    Export-Clixml "C:\Apps\BudgetApp\secrets\certificate.credential"

$certificatePassword = $null
$certificateCredential = $null
```

The exported password is protected for the Windows user and computer that created it. It is not a portable backup and another Windows user may not be able to decrypt it.

Test that the credential and certificate agree without displaying the password:

```powershell
$certificateCredential =
    Import-Clixml "C:\Apps\BudgetApp\secrets\certificate.credential"

$certificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new(
    "C:\Apps\BudgetApp\certs\budgetapp.p12",
    $certificateCredential.GetNetworkCredential().Password)

$certificate.Subject
$certificate.NotAfter

$certificate.Dispose()
$certificate = $null
$certificateCredential = $null
```

## 5. Create the Initial Production Schema

This step is appropriate only while `BudgetAppDb` is new and contains no real data. From the repository root:

```powershell
$env:ASPNETCORE_ENVIRONMENT = "Production"
$env:ConnectionStrings__BudgetApp =
    "Server=<sql-server-instance>;Database=BudgetAppDb;Integrated Security=True;TrustServerCertificate=True;"

dotnet tool restore

dotnet tool run dotnet-ef database update `
    --project ".\BudgetApp\BudgetApp.Infrastructure\BudgetApp.Infrastructure.csproj" `
    --startup-project ".\BudgetApp\BudgetApp.Server\BudgetApp.Server.csproj"

Remove-Item Env:ConnectionStrings__BudgetApp
Remove-Item Env:ASPNETCORE_ENVIRONMENT
```

Replace `<sql-server-instance>` with the local instance, such as `MY-PC\SQLEXPRESS`.

Refresh `BudgetAppDb` in SSMS and confirm `dbo.__EFMigrationsHistory` and the application tables exist.

After real household data has been entered, never repeat a Production migration casually. Back up first, generate and inspect a migration script, rehearse against Scratch, and use the migration/deployment checklist.

## 6. Start the Published Application

Open a fresh PowerShell window and paste:

```powershell
$env:ASPNETCORE_ENVIRONMENT = "Production"
$env:ASPNETCORE_URLS = "https://0.0.0.0:443"

$env:ASPNETCORE_Kestrel__Certificates__Default__Path =
    "C:\Apps\BudgetApp\certs\budgetapp.p12"

$certificateCredential =
    Import-Clixml "C:\Apps\BudgetApp\secrets\certificate.credential"

$env:ASPNETCORE_Kestrel__Certificates__Default__Password =
    $certificateCredential.GetNetworkCredential().Password

$certificateCredential = $null

$env:ConnectionStrings__BudgetApp =
    "Server=<sql-server-instance>;Database=BudgetAppDb;Integrated Security=True;TrustServerCertificate=True;"

Set-Location "C:\Apps\BudgetApp\publish"
.\BudgetApp.Server.exe
```

Keep this PowerShell window open while BudgetApp is running. Stop with `Ctrl+C` and close the window so all process-scoped configuration is discarded.

This interactive launch method does not require `.ps1` execution permission.

## 7. Verify the Running Installation

Read the first startup log entry. It must say:

```text
Starting BudgetApp.Server in Production, configured for SQL Server <server> and database BudgetAppDb
```

In another PowerShell window:

```powershell
Invoke-RestMethod "https://localhost/api/health"
```

Then verify in the browser:

1. `https://localhost` loads without a server error.
2. Registration or login succeeds.
3. The dashboard loads.
4. The browser is connected to the intended local Production URL.
5. Development-only users and fictional Development data do not appear.
6. Restarting the published app preserves Production data.

If this is the first real installation, create the real user and household only after all checks pass.

## 8. Stop and Restart

Stop:

1. Focus the launch PowerShell window.
2. Press `Ctrl+C`.
3. Close the PowerShell window.

Restart by repeating step 6. Do not set the Production values globally just to shorten startup.

Automatic startup as a Windows service or scheduled task is intentionally deferred. It needs a dedicated service identity, certificate access, secret loading, log retention, and recovery design.

## What This Installation Does Not Yet Provide

- Automated database backups.
- Tested restore and disaster-recovery procedures.
- Safe application upgrades and rollback.
- Automated Production migrations.
- Windows service hosting.
- Internet access, reverse proxying, or public TLS.
- Email delivery or password recovery.

These are separate infrastructure and security milestones. The local app should remain private until they are designed and verified.

## Troubleshooting

### The certificate password is incorrect

Repeat the certificate test in step 4. If it fails, recreate `certificate.credential` by entering the actual `.p12` password. Do not place the password directly in a script or committed file.

### The app starts against the wrong database

The safety guard should terminate startup. Confirm the connection string names `BudgetAppDb`, close the PowerShell window, and start again. Do not weaken the guard.

### Port 443 is already in use or access is denied

```powershell
Get-NetTCPConnection -LocalPort 443 -ErrorAction SilentlyContinue
```

Stop the conflicting process. Binding to port 443 may require appropriate Windows URL/port permissions. Do not run the application permanently as an administrator merely to bypass a permissions problem.

### The package verifier reports a missing `wwwroot\index.html`

The React client was not included in the publish. Confirm Node/npm dependencies are restored, run the client build, then repeat `dotnet publish`.

### Production reports pending or missing tables

Stop the app. Inspect `dbo.__EFMigrationsHistory` in `BudgetAppDb`. Do not improvise a migration against real data; proceed through the backup and migration checklist.

## Related Documentation

- [Clean development machine setup](development-setup.md)
- [Database environments](database-environments.md)
- [Local development and secrets](local-development.md)
- [Technical logging](logging.md)
