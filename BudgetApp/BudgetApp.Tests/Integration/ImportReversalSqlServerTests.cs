using System.Data;
using System.Data.Common;
using BudgetApp.Application.Imports;
using BudgetApp.Infrastructure;
using BudgetApp.Infrastructure.Data;
using BudgetApp.Infrastructure.Email;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;

namespace BudgetApp.Tests.Integration;

public sealed class ImportReversalSqlServerTests
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task PreviewAndCommandQueriesTranslateForProductionAndDoNotReadRawWorkbookData(bool forUpdate)
    {
        var capture = new Capture();
        var services = new ServiceCollection(); services.AddLogging();
        services.AddInfrastructure("Server=unused;Database=unused;Integrated Security=True;",
            new EmailOptions(), new ApplicationUrlOptions(), false);
        services.AddDbContext<BudgetAppDbContext>(options => options.AddInterceptors(new NoConnection(), capture));
        using var provider = services.BuildServiceProvider(); using var scope = provider.CreateScope();
        var result = await scope.ServiceProvider.GetRequiredService<IImportReversalRepository>()
            .GetSnapshotAsync(Guid.NewGuid(), 10000, default, forUpdate);
        Assert.Empty(result.Drafts); Assert.Empty(result.Transactions);
        Assert.Equal(3, capture.Commands.Count); // Drafts, transactions, one audit identity scan (empty results).
        Assert.Contains(10001, capture.Limits);
        Assert.All(capture.Commands, sql => Assert.DoesNotContain("[RawData]", sql));
        Assert.Contains("[AuditEvents]", capture.Commands[2]);
        Assert.Empty(scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>().ChangeTracker.Entries());
    }

    private sealed class NoConnection : DbConnectionInterceptor
    {
        public override ValueTask<InterceptionResult> ConnectionOpeningAsync(DbConnection connection,
            ConnectionEventData data, InterceptionResult result, CancellationToken ct = default) =>
            ValueTask.FromResult(InterceptionResult.Suppress());
    }
    private sealed class Capture : DbCommandInterceptor
    {
        public List<string> Commands { get; } = [];
        public List<int> Limits { get; } = [];
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command,
            CommandEventData data, InterceptionResult<DbDataReader> result, CancellationToken ct = default)
        {
            Commands.Add(command.CommandText);
            foreach (DbParameter p in command.Parameters) if (p.Value is int value) Limits.Add(value);
            var table = new DataTable();
            // Split-query buffering validates the column count even for an empty
            // result. No rows/real connection are needed for translation checks.
            for (var i = 0; i < 32; i++) table.Columns.Add($"Column{i}", typeof(object));
            return ValueTask.FromResult(InterceptionResult<DbDataReader>.SuppressWithResult(table.CreateDataReader()));
        }
    }
}
