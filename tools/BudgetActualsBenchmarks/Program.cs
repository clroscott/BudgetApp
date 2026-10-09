using System.Data.Common;
using System.Diagnostics;
using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using BudgetApp.Application.Budgets;
using BudgetApp.Domain.Budgeting;
using BudgetApp.Infrastructure;
using BudgetApp.Infrastructure.Data;
using BudgetApp.Infrastructure.Email;
using BudgetApp.Profiling;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;

if (args.Length != 3 || args[0] != "--run" || args[1] != "--server")
{
    Console.WriteLine("Usage: dotnet run -c Release --project tools/BudgetActualsBenchmarks -- --run --server 'HOST\\SQLEXPRESS'");
    Console.WriteLine("Creates uniquely named disposable BudgetAppPerf210_* databases, never reads app configuration, and never sends email.");
    return;
}
var masterBuilder = new SqlConnectionStringBuilder { DataSource = args[2], InitialCatalog = "master",
    IntegratedSecurity = true, Encrypt = true, TrustServerCertificate = true, Pooling = false, ConnectTimeout = 10 };
var output = Path.Combine("tools", "BudgetActualsBenchmarks", "results-" + DateTime.UtcNow.ToString("yyyyMMdd-HHmmss"));
Directory.CreateDirectory(output);
var results = new List<object>();
await using var master = new SqlConnection(masterBuilder.ConnectionString);
await master.OpenAsync();
var versionCommand = new SqlCommand("SELECT CAST(SERVERPROPERTY('Edition') AS nvarchar(128)) + ' / ' + CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(128));", master);
var version = (string)(await versionCommand.ExecuteScalarAsync())!;
foreach (var size in new[] { 1000, 10000, 100000 })
{
    var database = "BudgetAppPerf210_" + Guid.NewGuid().ToString("N");
    // Name is generated here, validated, and CREATE must succeed before cleanup
    // is armed. Existing databases cannot become targets of this tool.
    if (!Regex.IsMatch(database, "^BudgetAppPerf210_[a-f0-9]{32}$")) throw new InvalidOperationException("Unsafe fixture name.");
    await new SqlCommand($"CREATE DATABASE [{database}];", master).ExecuteNonQueryAsync();
    Console.WriteLine($"Created disposable {database}: {size:N0} generated rows plus financial edge cases.");
    try
    {
        var builder = new SqlConnectionStringBuilder(masterBuilder.ConnectionString) { InitialCatalog = database };
        var capture = new QueryCapture();
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddInfrastructure(builder.ConnectionString, new EmailOptions(), new ApplicationUrlOptions(), false);
        services.AddDbContext<BudgetAppDbContext>(options => options.AddInterceptors(capture));
        using var provider = services.BuildServiceProvider();
        using var scope = provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        await db.Database.EnsureCreatedAsync();
        var fixture = await BudgetActualsFixture.Seed(db);
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            WITH numbers AS (SELECT TOP ({size}) ROW_NUMBER() OVER (ORDER BY a.object_id, b.object_id) AS n
                FROM sys.all_objects a CROSS JOIN sys.all_objects b)
            INSERT INTO Transactions (Id, HouseholdId, AccountId, CategoryId, TransactionDate, Amount, Description,
                Source, ReviewStatus, IsExcludedFromBudget, IsVoided, LastModifiedByUserId, CreatedAtUtc, UpdatedAtUtc)
            SELECT NEWID(), {fixture.HouseholdId}, {fixture.SharedAccountId},
                CASE WHEN n % 3 = 0 THEN {fixture.RootId} WHEN n % 3 = 1 THEN {fixture.ChildId} ELSE {fixture.InactiveId} END,
                DATEADD(day, CAST(n % 365 AS int), CAST('2026-01-01' AS date)),
                CAST(CASE WHEN n % 7 = 0 THEN -12.3456 ELSE 23.4567 END AS decimal(19,4)), N'Synthetic profiling only',
                'Manual', 'Reviewed', 0, 0, {fixture.OwnerId}, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET() FROM numbers;
            """);
        if (await db.Transactions.CountAsync() != size + 27) throw new InvalidOperationException("Fixture generation count mismatch.");
        var repository = scope.ServiceProvider.GetRequiredService<IBudgetRepository>();
        var legacy = new LegacyBudgetActualsReader(db);
        // SQL Server parity includes its real decimal arithmetic, query execution,
        // collation, per-user selections and private-account eligibility.
        foreach (var user in new[] { fixture.OwnerId, fixture.ViewerId })
        foreach (var budgetScope in new[] { BudgetScope.Household, BudgetScope.Personal })
        foreach (var currency in new[] { "CAD", "USD" })
        {
            Check(await legacy.Monthly(fixture.HouseholdId, user, budgetScope, currency),
                await repository.GetActualsAsync(fixture.HouseholdId, user, 2026, 1, budgetScope, currency, default));
            Check(await legacy.Historical(fixture.HouseholdId, user, budgetScope, currency),
                await repository.GetHistoricalActualsAsync(fixture.HouseholdId, user, new(2025, 1, 1), new(2026, 12, 31), budgetScope, currency, default));
            Check(await legacy.Annual(fixture.HouseholdId, user, budgetScope, currency),
                await repository.GetAnnualActualsAsync(fixture.HouseholdId, user, 2026, budgetScope, currency, default));
        }
        await db.Database.OpenConnectionAsync();
        var connection = (SqlConnection)db.Database.GetDbConnection();
        var io = new List<string>();
        connection.InfoMessage += (_, message) => io.Add(message.Message);
        await new SqlCommand("SET LANGUAGE us_english; SET STATISTICS IO ON;", connection).ExecuteNonQueryAsync();
        connection.StatisticsEnabled = true;
        var operations = new (string Name, Func<Task<object>> Old, Func<Task<object>> New)[]
        {
            ("monthly", async () => await legacy.Monthly(fixture.HouseholdId, fixture.OwnerId, BudgetScope.Household, "CAD"),
                async () => await repository.GetActualsAsync(fixture.HouseholdId, fixture.OwnerId, 2026, 1, BudgetScope.Household, "CAD", default)),
            ("historical", async () => await legacy.Historical(fixture.HouseholdId, fixture.OwnerId, BudgetScope.Household, "CAD"),
                async () => await repository.GetHistoricalActualsAsync(fixture.HouseholdId, fixture.OwnerId, new(2025, 1, 1), new(2026, 12, 31), BudgetScope.Household, "CAD", default)),
            ("annual", async () => await legacy.AnnualRaw(fixture.HouseholdId, fixture.OwnerId, BudgetScope.Household, "CAD"),
                async () => await repository.GetAnnualActualsAsync(fixture.HouseholdId, fixture.OwnerId, 2026, BudgetScope.Household, "CAD", default))
        };
        foreach (var operation in operations)
        {
            await operation.Old(); await operation.New(); // Warm both paths; do not flush shared SQL Server caches.
            var oldSamples = new List<Sample>(); var newSamples = new List<Sample>();
            for (var repeat = 0; repeat < 15; repeat++)
            {
                // Alternate which path runs first to reduce ordering bias.
                if (repeat % 2 == 0) { oldSamples.Add(await Measure(operation.Old)); newSamples.Add(await Measure(operation.New)); }
                else { newSamples.Add(await Measure(operation.New)); oldSamples.Add(await Measure(operation.Old)); }
            }
            var oldPlanReads = await SavePlan(operation.Old, "baseline");
            var newPlanReads = await SavePlan(operation.New, "grouped");
            var oldSummary = Summarize(oldSamples); var newSummary = Summarize(newSamples);
            results.Add(new { GeneratedTransactions = size, Operation = operation.Name, ExactParity = true,
                Baseline = oldSummary with { ActualPlanLogicalReads = oldPlanReads },
                Grouped = newSummary with { ActualPlanLogicalReads = newPlanReads } });
            Console.WriteLine($"{size,6} {operation.Name,-10} rows {oldSummary.ReturnedRows} -> {newSummary.ReturnedRows}; p50 {oldSummary.P50Milliseconds:F2} -> {newSummary.P50Milliseconds:F2} ms");
            async Task<long> SavePlan(Func<Task<object>> work, string variant)
            {
                capture.Commands.Clear();
                await work();
                var sql = capture.Commands.Single();
                var prefix = Path.Combine(output, $"{size}-{operation.Name}-{variant}");
                await File.WriteAllTextAsync(prefix + ".sql", sql.Text);
                // Capture actual per-operator reads and plans outside timing.
                // Missing STATISTICS IO messages are unavailable, never zero.
                await using var command = new SqlCommand("SET STATISTICS XML ON; " + sql.Text + "; SET STATISTICS XML OFF;", connection);
                foreach (var parameter in sql.Parameters) command.Parameters.Add(parameter);
                await using var reader = await command.ExecuteReaderAsync();
                do
                {
                    if (reader.FieldCount == 1 && reader.GetName(0).Contains("Showplan", StringComparison.OrdinalIgnoreCase) && await reader.ReadAsync())
                    {
                        var xml = reader.GetString(0);
                        await File.WriteAllTextAsync(prefix + ".sqlplan", xml);
                        var attributes = XDocument.Parse(xml).Descendants().Attributes("ActualLogicalReads").ToList();
                        if (attributes.Count == 0) throw new InvalidOperationException("Actual plan read counters are unavailable.");
                        var reads = attributes.Sum(attribute => long.Parse(attribute.Value, CultureInfo.InvariantCulture));
                        while (await reader.NextResultAsync()) while (await reader.ReadAsync()) { }
                        return reads;
                    }
                    while (await reader.ReadAsync()) { }
                } while (await reader.NextResultAsync());
                throw new InvalidOperationException("Actual query plan was not returned.");
            }
        }
        async Task<Sample> Measure(Func<Task<object>> work)
        {
            io.Clear(); connection.ResetStatistics();
            var allocated = GC.GetTotalAllocatedBytes(true);
            var timer = Stopwatch.StartNew();
            await work(); timer.Stop();
            var bytes = GC.GetTotalAllocatedBytes(true) - allocated;
            var statistics = connection.RetrieveStatistics();
            var matches = io.SelectMany(text => Regex.Matches(text, @"logical reads (\d+)").Cast<Match>()).ToList();
            long? reads = matches.Count == 0 ? null : matches.Sum(match => long.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture));
            return new(timer.Elapsed.TotalMilliseconds, bytes, Convert.ToInt64(statistics["SelectRows"]),
                Convert.ToInt64(statistics["BytesReceived"]), reads);
        }
    }
    finally
    {
        // Connections from this scope use Pooling=false and have been disposed.
        // No SINGLE_USER/forced rollback or deletion of other databases.
        await new SqlCommand($"DROP DATABASE [{database}];", master).ExecuteNonQueryAsync();
        Console.WriteLine($"Removed disposable {database}.");
    }
}
await File.WriteAllTextAsync(Path.Combine(output, "results.json"), JsonSerializer.Serialize(new {
    Utc = DateTimeOffset.UtcNow, SqlServer = version, Runtime = Environment.Version.ToString(), Configuration = "Release",
    Notes = "15 alternating warm samples per path. Repository-read latency, not HTTP/UI latency. Process-wide managed allocations. No global cache flush or index changes.",
    Results = results }, new JsonSerializerOptions { WriteIndented = true }));
Console.WriteLine("Results and actual query plans: " + output);

static void Check(object expected, object actual)
{
    if (Canonical(expected) != Canonical(actual)) throw new InvalidOperationException("Exact financial parity failed; stop profiling.");
}
static string Canonical(object value)
{
    string Amount(decimal amount) => amount.ToString("G29", CultureInfo.InvariantCulture);
    return value switch
    {
        LegacyBudgetActualsReader.LegacyAnnualActuals record => Canonical(record.Normalize()),
        BudgetActualsRecord record => JsonSerializer.Serialize(new { Amounts = record.AmountsByCategoryId.OrderBy(row => row.Key).Select(row => new { row.Key, Value = Amount(row.Value) }),
            Uncategorized = Amount(record.UncategorizedAmount), record.CurrencyMismatchTransactionCount }),
        IReadOnlyList<BudgetHistoricalActualRecord> records => JsonSerializer.Serialize(records.OrderBy(row => (row.Year, row.Month, row.CategoryId))
            .Select(row => new { row.Year, row.Month, row.CategoryId, Amount = Amount(row.Amount) })),
        AnnualBudgetActualsRecord record => JsonSerializer.Serialize(new { Rows = record.CategoryMonths.OrderBy(row => (row.Month, row.CategoryId))
            .Select(row => new { row.Month, row.CategoryId, row.CategoryType, Spending = Amount(row.SpendingAmount), Income = Amount(row.IncomeAmount) }), record.CurrencyMismatchTransactionCount }),
        _ => throw new ArgumentException("Unknown profiling result.")
    };
}
static Summary Summarize(List<Sample> samples)
{
    var ordered = samples.OrderBy(sample => sample.Milliseconds).ToList();
    return new(ordered[ordered.Count / 2].Milliseconds, ordered[(int)Math.Ceiling(ordered.Count * .95) - 1].Milliseconds,
        (long)samples.Average(sample => sample.AllocatedBytes), samples[0].ReturnedRows, samples[0].BytesReceived, samples[0].LogicalReads);
}
internal sealed record Sample(double Milliseconds, long AllocatedBytes, long ReturnedRows, long BytesReceived, long? LogicalReads);
internal sealed record Summary(double P50Milliseconds, double P95Milliseconds, long MeanAllocatedBytes, long ReturnedRows, long BytesReceived, long? LogicalReads)
{
    public long ActualPlanLogicalReads { get; init; }
}
internal sealed class QueryCapture : DbCommandInterceptor
{
    public List<(string Text, SqlParameter[] Parameters)> Commands { get; } = [];
    public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command, CommandEventData eventData,
        InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
    {
        Commands.Add((command.CommandText, command.Parameters.Cast<SqlParameter>().Select(parameter => new SqlParameter(parameter.ParameterName, parameter.SqlDbType)
            { Value = parameter.Value, Size = parameter.Size, Precision = parameter.Precision, Scale = parameter.Scale }).ToArray()));
        return ValueTask.FromResult(result);
    }
}
