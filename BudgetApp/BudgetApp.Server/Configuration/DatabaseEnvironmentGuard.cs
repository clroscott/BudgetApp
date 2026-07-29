using System.Data.Common;

namespace BudgetApp.Server.Configuration;

public sealed record DatabaseEnvironmentInfo(
    string ServerName,
    string DatabaseName);

public static class DatabaseEnvironmentGuard
{
    public static DatabaseEnvironmentInfo Validate(
        string environmentName,
        string connectionString,
        string? expectedDatabaseName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(environmentName);
        ArgumentException.ThrowIfNullOrWhiteSpace(connectionString);

        var connectionBuilder = new DbConnectionStringBuilder
        {
            ConnectionString = connectionString
        };
        var serverName = ReadValue(
            connectionBuilder,
            "Server",
            "Data Source",
            "Address",
            "Addr",
            "Network Address");
        var databaseName = ReadValue(
            connectionBuilder,
            "Database",
            "Initial Catalog");

        var requiresExactDatabase =
            environmentName.Equals("Development", StringComparison.OrdinalIgnoreCase) ||
            environmentName.Equals("Production", StringComparison.OrdinalIgnoreCase) ||
            environmentName.Equals("Scratch", StringComparison.OrdinalIgnoreCase);
        if (requiresExactDatabase)
        {
            ArgumentException.ThrowIfNullOrWhiteSpace(expectedDatabaseName);

            if (!databaseName.Equals(
                    expectedDatabaseName,
                    StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException(
                    $"BudgetApp cannot start in {environmentName} because the configured " +
                    $"database is '{Display(databaseName)}'. Expected database " +
                    $"'{expectedDatabaseName}'. Check the environment-specific connection string.");
            }
        }

        return new DatabaseEnvironmentInfo(
            Display(serverName),
            Display(databaseName));
    }

    private static string ReadValue(
        DbConnectionStringBuilder connectionBuilder,
        params string[] keys)
    {
        foreach (var key in keys)
        {
            if (connectionBuilder.TryGetValue(key, out var value) &&
                value is not null &&
                !string.IsNullOrWhiteSpace(value.ToString()))
            {
                return value.ToString()!.Trim();
            }
        }

        return string.Empty;
    }

    private static string Display(string value) =>
        string.IsNullOrWhiteSpace(value) ? "(not specified)" : value;
}
