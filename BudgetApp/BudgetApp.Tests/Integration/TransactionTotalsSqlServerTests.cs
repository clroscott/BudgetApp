using System.Data;
using System.Data.Common;
using BudgetApp.Application.Transactions;
using BudgetApp.Infrastructure;
using BudgetApp.Infrastructure.Data;
using BudgetApp.Infrastructure.Email;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;

namespace BudgetApp.Tests.Integration;

public sealed class TransactionTotalsSqlServerTests
{
    [Fact]
    public async Task Totals_TranslateToSqlServerGroupByBeforePagination_WithoutOpeningARealConnection()
    {
        var capture = new EmptyResultsInterceptor();
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddInfrastructure("Server=unused;Database=unused;Integrated Security=True;",
            new EmailOptions(), new ApplicationUrlOptions(), false);
        services.AddDbContext<BudgetAppDbContext>(options => options.AddInterceptors(
            new NoConnectionInterceptor(), capture));
        using var provider = services.BuildServiceProvider();
        using var scope = provider.CreateScope();
        var repository = scope.ServiceProvider.GetRequiredService<ITransactionRepository>();
        var result = await repository.ListVisibleAsync(Guid.NewGuid(), Guid.NewGuid(), null,
            new DateOnly(2026, 1, 1), new DateOnly(2026, 12, 31), null, Guid.NewGuid(), false,
            null, 100, 100, CancellationToken.None, "Personal", "CAD", true);

        Assert.Empty(result.Items);
        Assert.Empty(result.TotalsByCurrency);
        var aggregate = Assert.Single(capture.Commands, sql => sql.Contains("GROUP BY", StringComparison.Ordinal));
        Assert.Contains("SUM(", aggregate);
        Assert.Contains("IsVoided", aggregate);
        Assert.Contains("IsExcludedFromBudget", aggregate);
        Assert.Contains("PersonalBudgetInclusions", aggregate);
        Assert.Contains("HouseholdId", aggregate);
        Assert.Contains("ParentCategoryId", aggregate);
        Assert.DoesNotContain("OFFSET", aggregate);
        Assert.DoesNotContain("FETCH NEXT", aggregate);
        Assert.Contains(capture.Commands, sql => sql.Contains("OFFSET", StringComparison.Ordinal));
    }

    // SQL Server's actual query translator runs, but no network or database is used.
    private sealed class NoConnectionInterceptor : DbConnectionInterceptor
    {
        public override ValueTask<InterceptionResult> ConnectionOpeningAsync(DbConnection connection,
            ConnectionEventData eventData, InterceptionResult result, CancellationToken cancellationToken = default) =>
            ValueTask.FromResult(InterceptionResult.Suppress());
    }
    private sealed class EmptyResultsInterceptor : DbCommandInterceptor
    {
        public List<string> Commands { get; } = [];
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command,
            CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
        {
            Commands.Add(command.CommandText);
            var table = new DataTable();
            if (command.CommandText.Contains("COUNT(*)", StringComparison.Ordinal))
            {
                table.Columns.Add("Count", typeof(int));
                table.Rows.Add(0);
            }
            return ValueTask.FromResult(InterceptionResult<DbDataReader>.SuppressWithResult(table.CreateDataReader()));
        }
    }
}
