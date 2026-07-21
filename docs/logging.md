# Technical Logging

## Approach

BudgetApp uses the built-in `Microsoft.Extensions.Logging` abstractions with Serilog configured by the Server. Classes in Application and Infrastructure can receive `ILogger<T>` through dependency injection. Domain remains free of logging dependencies.

All enabled events go to the console. `Error` and `Critical` events are also saved to daily rolling files under `BudgetApp.Server/logs` so failures remain available after the application stops. A centralized provider can be added later without changing calls to `ILogger<T>` throughout the application.

## Levels

- `Trace`: very detailed temporary diagnostics; normally disabled.
- `Debug`: development diagnostics that help follow internal decisions.
- `Information`: normal application milestones and completed operations.
- `Warning`: unexpected or degraded behavior from which the application recovered.
- `Error`: an operation failed and needs investigation.
- `Critical`: the application or a critical subsystem cannot continue.

Do not use `Information` for every internal method call. Log meaningful boundaries such as a completed import, an approved batch, or a failed external operation.

## Structured Logging

Use message templates and named properties:

```csharp
logger.LogInformation(
    "Created {DraftCount} transaction drafts for import {ImportFileId}",
    draftCount,
    importFileId);
```

Do not use string interpolation for log messages. Named properties allow a future logging provider to filter and aggregate events reliably.

## Privacy and Security

Never log:

- Connection strings, passwords, tokens, API keys, or secrets.
- CSV contents or uploaded file contents.
- Bank account numbers or credentials.
- Full transaction descriptions, notes, or other sensitive financial details.
- HTTP request or response bodies.
- Query strings unless they have been explicitly reviewed as safe.

Prefer internal identifiers, counts, status values, durations, and trace IDs. Log exceptions with the `Exception` overload so stack traces remain available without manually inserting exception text into a message.

## HTTP Requests

The Server logs one completion event for each `/api` request with:

- HTTP method.
- Request path, excluding the query string.
- Response status code.
- Elapsed time.
- W3C trace identifier.

Failed API requests are logged at `Error` with the exception and then rethrown for normal ASP.NET error handling. Static frontend assets are not included in request logging.

## Environment Configuration

The base configuration logs BudgetApp events at `Information` and keeps framework and SQL command noise at `Warning`.

Development enables BudgetApp `Debug` events and EF Core SQL commands at `Information`. EF Core sensitive-data logging is not enabled, so SQL parameter values remain hidden.

## Error Files

Persistent error files use the name `budgetapp-errors-YYYYMMDD.log` under the Server project's `logs` directory. Files roll daily or when they reach 10 MB, whichever comes first. Files older than 14 days are removed, and the file count is capped at 31 as an additional disk-usage safeguard.

The repository ignores the `logs` directory and `*.log` files. Never attach an entire error file to an issue or pull request without first checking it for sensitive information.

Unhandled API exceptions and fatal startup failures are written to these files. Expected failures that application code catches should call `LogWarning` or `LogError`, as appropriate, because a caught exception cannot be logged automatically.
