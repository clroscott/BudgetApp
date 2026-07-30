# Database Environments

## Purpose

BudgetApp keeps real household data separate from development and disposable testing data. A connection string must never be moved between environments merely for convenience.

| Environment | Database | Purpose | Data policy |
| --- | --- | --- | --- |
| Production | `BudgetAppDb` | Real data used by the published local app | Real household data |
| Development | `BudgetAppDb_DEV` | Visual Studio, debugging, and normal feature work | Fictional development data only |
| Scratch | `BudgetAppDb_Scratch` | Risky migration, import, backup, and restore exercises | Disposable fictional data; may temporarily hold a protected Production restore during a controlled restore drill |
| Testing | In-memory SQLite | Automated integration tests | Created and discarded by the test suite |

The Scratch database may be empty until a test requires it. It must never be treated as a backup. If Production is temporarily restored into Scratch for a restore drill, Scratch becomes Production-sensitive and must be cleaned immediately after reconciliation.

## Built-in Safety Checks

The Server validates the configured database before it registers database services:

- `Development` requires `BudgetAppDb_DEV`.
- `Production` requires `BudgetAppDb`.
- `Scratch` requires `BudgetAppDb_Scratch`.
- `Testing` remains available to the isolated SQLite integration-test host.

An incorrect pairing terminates startup with an error that names the configured and expected databases. The full connection string is never logged.

Successful startup logs the environment, SQL Server name, and database name. Always read this line before testing a migration or destructive workflow:

```text
Starting BudgetApp.Server in Development, configured for SQL Server <server> and database BudgetAppDb_DEV
```

Do not add database information to the public health response.

## Development

Visual Studio launch profiles set `ASPNETCORE_ENVIRONMENT` to `Development`. The Development connection string belongs in ASP.NET Core User Secrets.

From the repository root:

```powershell
dotnet user-secrets set `
    "ConnectionStrings:BudgetApp" `
    "Server=<sql-server-instance>;Database=BudgetAppDb_DEV;Integrated Security=True;TrustServerCertificate=True;" `
    --project ".\BudgetApp\BudgetApp.Server\BudgetApp.Server.csproj"
```

Apply migrations explicitly to Development:

```powershell
$env:ASPNETCORE_ENVIRONMENT = "Development"

dotnet tool restore

dotnet ef database update `
    --project ".\BudgetApp\BudgetApp.Infrastructure\BudgetApp.Infrastructure.csproj" `
    --startup-project ".\BudgetApp\BudgetApp.Server\BudgetApp.Server.csproj" `
    --connection "Server=<sql-server-instance>;Database=BudgetAppDb_DEV;Integrated Security=True;TrustServerCertificate=True;"

Remove-Item Env:ASPNETCORE_ENVIRONMENT
```

Register a development-only user and create fictional household data through the application. Never copy real transactions, credentials, or household membership into Development.

## Production

The published backend runs with process-scoped configuration. Do not persist `ConnectionStrings__BudgetApp` at User or Machine scope because Visual Studio would inherit it and environment variables override Development user secrets.

The current local publish folder is:

```text
C:\Apps\BudgetApp\publish
```

The certificate password is stored outside the repository in a Windows DPAPI-encrypted credential file:

```text
C:\Apps\BudgetApp\secrets\certificate.credential
```

The credential can only be decrypted by the Windows user on the computer that created it. It is not portable backup material.

Start the published app by pasting this block into a fresh PowerShell window:

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

Stop the app with `Ctrl+C` and close that PowerShell window so its process-scoped values are discarded.

Do not apply Production migrations as part of ordinary development. Production migrations require the backup, migration, deployment, and verification checklist.

## Scratch

Scratch configuration is deliberately temporary. Do not store its connection string in User Secrets or persistent environment variables.

Apply the current migrations to Scratch:

```powershell
$env:ASPNETCORE_ENVIRONMENT = "Scratch"
$env:ConnectionStrings__BudgetApp =
    "Server=<sql-server-instance>;Database=BudgetAppDb_Scratch;Integrated Security=True;TrustServerCertificate=True;"

dotnet tool restore

dotnet ef database update `
    --project ".\BudgetApp\BudgetApp.Infrastructure\BudgetApp.Infrastructure.csproj" `
    --startup-project ".\BudgetApp\BudgetApp.Server\BudgetApp.Server.csproj" `
    --connection $env:ConnectionStrings__BudgetApp

Remove-Item Env:ConnectionStrings__BudgetApp
Remove-Item Env:ASPNETCORE_ENVIRONMENT
```

Use Scratch for operations such as:

- Generating and inspecting a migration script.
- Testing a migration against a disposable schema.
- Practising backup and restore procedures.
- Testing malformed or unusually large imports.
- Verifying destructive reset procedures.

Before dropping or restoring Scratch, confirm its exact name in both the command and SSMS. Never adapt a destructive Scratch command by replacing only part of the database name.

## Verification Checklist

### Visual Studio

- The startup log says `Development`.
- The startup log names `BudgetAppDb_DEV`.
- Production accounts cannot log in.
- Only fictional development data appears.

### Published app

- The startup log says `Production`.
- The startup log names `BudgetAppDb`.
- Existing real household data appears.
- Stopping and closing the launch PowerShell removes the process-scoped configuration.

### Scratch

- The command sets `ASPNETCORE_ENVIRONMENT` to `Scratch`.
- The connection string names `BudgetAppDb_Scratch`.
- The startup or EF output does not name Production or Development.
- Losing everything in the database is acceptable.

## Troubleshooting

If BudgetApp reports that the configured database does not match the environment:

1. Stop immediately; do not weaken or remove the guard.
2. Read the configured and expected database names in the error.
3. Check for Process, User, and Machine environment variables.
4. Confirm the Development User Secret without posting its value.
5. Close and reopen Visual Studio after changing persistent environment variables.
6. Confirm that the browser URL belongs to the intended app instance.

Installing the frontend as a browser app does not create a separate backend. The installed app continues using the server URL from which it was installed.

## Related Documentation

- [Local Production deployment checklist](local-production-deployment-checklist.md)
- [Manual Production database backup and restore](database-backup-restore.md)
- [Initial local Production installation](local-production-installation.md)
