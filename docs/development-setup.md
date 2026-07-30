# Clean Development Machine Setup

## Goal

This guide makes BudgetApp reproducible from a clean clone for development. It configures the application to use `BudgetAppDb_DEV`, builds both projects, runs the tests, and starts the Visual Studio/debug version.

It does **not** install or configure the published Production app in `C:\Apps\BudgetApp`, restore real financial data, or create production secrets.

## Supported Development Tools

The versions below match the current project and build workflow.

| Tool | Supported version | Notes |
| --- | --- | --- |
| Windows | Windows 11 | The documented SQL Server and Visual Studio workflow is Windows-based. |
| Git | Current supported release | Required to clone the repository. |
| .NET SDK | .NET 10, SDK `10.0.300` or newer | `global.json` keeps the repository on .NET 10 while allowing newer .NET 10 feature bands. |
| Visual Studio | Visual Studio 2026; 18.8 tested | Install the **ASP.NET and web development** workload. The CLI workflow also works without Visual Studio. |
| Node.js | Node 22 LTS recommended | Vite supports Node `20.19+` or `22.12+`. Node 24 is also compatible. |
| npm | npm 10 or newer | On Windows PowerShell, use `npm.cmd` if `npm.ps1` is blocked by execution policy. |
| SQL Server | SQL Server Express or Developer edition; SQL Server 2022+ recommended | A local named instance such as `<computer>\SQLEXPRESS` is sufficient. |
| SSMS | SQL Server Management Studio 22 recommended | Optional, but useful for creating and inspecting databases. |

Official installers:

- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- [Visual Studio](https://visualstudio.microsoft.com/downloads/)
- [Node.js](https://nodejs.org/en/download)
- [SQL Server](https://www.microsoft.com/sql-server/sql-server-downloads)
- [SQL Server Management Studio](https://learn.microsoft.com/ssms/install/install)

## 1. Clone and Open the Repository

```powershell
git clone <your-budgetapp-repository-url>
Set-Location ".\BudgetApp"
```

The repository root contains `global.json`, `.config\dotnet-tools.json`, `README.md`, and the `BudgetApp` solution directory.

To use Visual Studio, open:

```text
BudgetApp\BudgetApp.slnx
```

## 2. Check the Installed Tools

```powershell
dotnet --version
node --version
npm.cmd --version
```

The .NET command should report a compatible .NET 10 SDK. If `npm` reports that `npm.ps1` cannot run, do not change the machine execution policy just for BudgetApp; use `npm.cmd` as shown throughout this guide.

## 3. Restore Dependencies

Run these commands from the repository root:

```powershell
dotnet tool restore
dotnet restore ".\BudgetApp\BudgetApp.slnx"

Set-Location ".\BudgetApp\budgetapp.client"
npm.cmd ci
Set-Location "..\.."
```

`dotnet tool restore` installs the repository-pinned EF Core command locally. `npm.cmd ci` installs exactly the versions in `package-lock.json`.

## 4. Create the Development Database

In SSMS, connect to the local SQL Server instance and create:

```text
BudgetAppDb_DEV
```

Do not use `BudgetAppDb`; that name is reserved for the published local Production app. `BudgetAppDb_Scratch` is reserved for disposable migration, restore, and import testing.

The application also has a database safety guard:

- `Development` accepts only `BudgetAppDb_DEV`.
- `Production` accepts only `BudgetAppDb`.
- `Scratch` accepts only `BudgetAppDb_Scratch`.

## 5. Configure the Development Connection String

Store the machine-specific connection string in ASP.NET Core User Secrets:

```powershell
dotnet user-secrets set `
    "ConnectionStrings:BudgetApp" `
    "Server=<sql-server-instance>;Database=BudgetAppDb_DEV;Integrated Security=True;TrustServerCertificate=True;" `
    --project ".\BudgetApp\BudgetApp.Server\BudgetApp.Server.csproj"
```

Replace `<sql-server-instance>` with a value such as `MY-PC\SQLEXPRESS`.

The structure is also shown in [development-user-secrets.example.json](samples/development-user-secrets.example.json). The example contains placeholders only and is not loaded by the application.

Confirm that the key exists:

```powershell
dotnet user-secrets list --project ".\BudgetApp\BudgetApp.Server\BudgetApp.Server.csproj"
```

Do not paste User Secrets output into an issue, pull request, log, or chat.

## 6. Apply the Current Migrations

From the repository root:

```powershell
$env:ASPNETCORE_ENVIRONMENT = "Development"

dotnet tool run dotnet-ef database update `
    --project ".\BudgetApp\BudgetApp.Infrastructure\BudgetApp.Infrastructure.csproj" `
    --startup-project ".\BudgetApp\BudgetApp.Server\BudgetApp.Server.csproj"

Remove-Item Env:ASPNETCORE_ENVIRONMENT
```

EF Core reads the Development connection string from User Secrets. The startup guard refuses to migrate a database whose name does not match the Development environment.

In SSMS, refresh `BudgetAppDb_DEV`. The database should contain the application tables and `dbo.__EFMigrationsHistory`.

## 7. Build and Test

```powershell
dotnet build ".\BudgetApp\BudgetApp.slnx"

Set-Location ".\BudgetApp\budgetapp.client"
npm.cmd run lint
npm.cmd run build
Set-Location "..\.."

dotnet test ".\BudgetApp\BudgetApp.Tests\BudgetApp.Tests.csproj" --no-build
```

## 8. Run the Application

### Visual Studio

1. Set `BudgetApp.Server` as the startup project.
2. Select the `https` profile.
3. Start debugging.
4. Confirm the startup log says `Development` and `BudgetAppDb_DEV`.

The client normally runs at `https://localhost:57251`, and the ASP.NET server listens at `https://localhost:7151` and `http://localhost:5121`.

### Command Line

From the repository root:

```powershell
$env:ASPNETCORE_ENVIRONMENT = "Development"
dotnet run --project ".\BudgetApp\BudgetApp.Server\BudgetApp.Server.csproj" --launch-profile https
```

Stop with `Ctrl+C`, then remove the process value if the same PowerShell window will be reused:

```powershell
Remove-Item Env:ASPNETCORE_ENVIRONMENT -ErrorAction SilentlyContinue
```

## 9. Verify the Complete Setup

After restoring dependencies and applying migrations, run:

```powershell
.\tools\verify-development-environment.cmd
```

This command does not require PowerShell script execution permission. It:

- checks .NET, Node, and npm;
- temporarily selects Development and ignores any connection-string environment variable inherited from its parent process;
- confirms the Development connection-string key exists without printing its value;
- lints and builds the React client;
- builds and tests the .NET solution;
- verifies that EF Core can read the migration history from Development.

It does not create, drop, reset, or modify a database.

## Fictional Development Data

After the application starts:

1. Register a development-only user.
2. Create a fictional household and fictional accounts.
3. Upload [expanded-transaction-search.csv](samples/expanded-transaction-search.csv) to exercise the import and transaction workflows.

Never seed Development from a Production backup. Never commit a real bank export, account number, email credential, password, token, or household record.

The project does not currently include an automatic demo-data seeder. This is intentional until a deterministic, fictional dataset is designed and reviewed.

## Resetting the Development Database

Reset only when all data in `BudgetAppDb_DEV` is disposable.

1. Stop the development server and Visual Studio debugger.
2. In SSMS, verify the exact database name is `BudgetAppDb_DEV`.
3. Delete `BudgetAppDb_DEV`.
4. Create a new empty `BudgetAppDb_DEV`.
5. Repeat the migration command in step 6.
6. Register a new fictional development user.

Do not turn this into a blind automated reset command. The explicit SSMS confirmation is a safety boundary between Development and Production.

For risky automation or restore practice, use `BudgetAppDb_Scratch` and follow [Database environments](database-environments.md).

## Troubleshooting

### PowerShell says running scripts is disabled

Use `npm.cmd` instead of `npm`. Use `tools\verify-development-environment.cmd` instead of trying to enable `.ps1` files globally. BudgetApp development does not require an execution-policy change.

### The HTTPS certificate is not trusted

```powershell
dotnet dev-certs https --check
dotnet dev-certs https --trust
```

Restart the browser and Visual Studio after trusting the certificate. This development certificate is separate from the published app certificate in `C:\Apps\BudgetApp`.

### A port is already in use

Check the known development ports:

```powershell
Get-NetTCPConnection -LocalPort 57251,7151,5121 -ErrorAction SilentlyContinue
```

Stop the stale BudgetApp, Vite, or debugger process before starting another copy.

### SQL Server cannot be reached

- Confirm the SQL Server service is running.
- Confirm SSMS can connect using the same server/instance name.
- For SQL Express, include the named instance, such as `MY-PC\SQLEXPRESS`.
- Confirm the database is named exactly `BudgetAppDb_DEV`.
- Confirm the Windows user has access when using Integrated Security.

### The database safety guard stops startup

Do not remove or weaken the guard. Check:

```powershell
$env:ASPNETCORE_ENVIRONMENT
[Environment]::GetEnvironmentVariable("ConnectionStrings__BudgetApp", "Process")
[Environment]::GetEnvironmentVariable("ConnectionStrings__BudgetApp", "User")
[Environment]::GetEnvironmentVariable("ConnectionStrings__BudgetApp", "Machine")
```

Development should load `BudgetAppDb_DEV` from User Secrets. A persistent connection-string environment variable can override User Secrets and should not be used for normal development.

### NuGet restore is stale or fails

First try:

```powershell
dotnet restore ".\BudgetApp\BudgetApp.slnx" --force-evaluate
```

If Visual Studio still shows stale package warnings, close Visual Studio, clear NuGet caches, reopen the solution, and restore:

```powershell
dotnet nuget locals all --clear
dotnet restore ".\BudgetApp\BudgetApp.slnx"
```

### npm dependencies are missing or inconsistent

From `BudgetApp\budgetapp.client`:

```powershell
npm.cmd ci
```

Use `npm.cmd ci`, rather than manually editing `node_modules`, so the lock file remains authoritative.

### EF Core cannot retrieve project metadata

Run commands from the repository root and use the exact project paths shown in step 6. The Infrastructure project owns migrations; the Server project supplies startup configuration.

## Related Documentation

- [Local development and secrets](local-development.md)
- [Database environments](database-environments.md)
- [Technical logging](logging.md)
- [Authentication](authentication.md)
