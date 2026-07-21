# Local Development and Secrets

## Purpose

BudgetApp uses ASP.NET Core configuration for backend settings. Secrets and machine-specific connection strings must stay outside the repository.

The committed `appsettings.json` contains an empty `ConnectionStrings:BudgetApp` placeholder so the expected configuration key is discoverable without exposing a real connection string.

## Backend User Secrets

The server project has an MSBuild `UserSecretsId`, which enables ASP.NET Core User Secrets during local development. User Secrets are stored outside the repository and are loaded automatically when the server runs in the Development environment.

Run these commands from the repository root.

Set the local database connection string:

```powershell
dotnet user-secrets set "ConnectionStrings:BudgetApp" "<your-local-connection-string>" --project BudgetApp/BudgetApp.Server/BudgetApp.Server.csproj
```

For example, Windows LocalDB can use a local-only development value:

```powershell
dotnet user-secrets set "ConnectionStrings:BudgetApp" "Server=(localdb)\MSSQLLocalDB;Database=BudgetApp;Trusted_Connection=True;TrustServerCertificate=True" --project BudgetApp/BudgetApp.Server/BudgetApp.Server.csproj
```

List the configured keys:

```powershell
dotnet user-secrets list --project BudgetApp/BudgetApp.Server/BudgetApp.Server.csproj
```

Remove the connection string:

```powershell
dotnet user-secrets remove "ConnectionStrings:BudgetApp" --project BudgetApp/BudgetApp.Server/BudgetApp.Server.csproj
```

Do not paste the output of `dotnet user-secrets list` into issues, pull requests, logs, or chat messages because values may be sensitive.

User Secrets are for local development only. They are not encrypted and are not a production secret store.

## Configuration Precedence

ASP.NET Core combines configuration sources. A local User Secrets value overrides the empty committed placeholder during Development.

The connection string can later be read through:

```csharp
builder.Configuration.GetConnectionString("BudgetApp")
```

Environment variables can also override nested configuration keys by replacing `:` with `__`:

```text
ConnectionStrings__BudgetApp
```

Production configuration is intentionally deferred. No production connection string belongs in source control.

## Frontend Environment Files

The React client currently requires no environment variables, so the repository does not include an `.env.example` file yet.

The repository ignores local Vite environment files, including:

- `.env`
- `.env.local`
- `.env.*.local`

If public frontend configuration is introduced later, add a documented `.env.example` containing placeholders only. Values exposed through Vite are delivered to the browser and must never contain passwords, database connection strings, API secrets, or AI provider keys.

AI providers and other secret-bearing services must be called by the ASP.NET backend behind application interfaces.

## Repository Safety Rules

- Keep committed `appsettings` files free of secrets and machine-specific values.
- Store local backend secrets with User Secrets or environment variables.
- Never commit `.env` files containing local values.
- Never place full account numbers, bank credentials, production passwords, or API keys in configuration examples.
- Review staged changes for credentials before committing.
