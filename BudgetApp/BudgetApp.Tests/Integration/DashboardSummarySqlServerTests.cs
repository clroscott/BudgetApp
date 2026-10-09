using System.Data;
using System.Data.Common;
using BudgetApp.Application.Dashboards;
using BudgetApp.Infrastructure;
using BudgetApp.Infrastructure.Data;
using BudgetApp.Infrastructure.Email;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;

namespace BudgetApp.Tests.Integration;

public sealed class DashboardSummarySqlServerTests
{
    [Theory]
    [InlineData("Household", false)]
    [InlineData("Household", true)]
    [InlineData("Personal", false)]
    [InlineData("Personal", true)]
    public async Task Activity_UsesSqlExistenceAndCount_AndOnlyAnOptInFiveRowProjection(string scope, bool includeRecent)
    {
        var capture = new CommandCapture();
        var services = new ServiceCollection(); services.AddLogging();
        services.AddInfrastructure("Server=unused;Database=unused;Integrated Security=True;", new EmailOptions(), new ApplicationUrlOptions(), false);
        services.AddDbContext<BudgetAppDbContext>(options => options.AddInterceptors(new NoConnection(), capture));
        using var provider = services.BuildServiceProvider(); using var serviceScope = provider.CreateScope();
        var result = await serviceScope.ServiceProvider.GetRequiredService<IDashboardSummaryRepository>()
            .GetActivityAsync(Guid.NewGuid(), Guid.NewGuid(), 2026, 1, scope, "CAD", includeRecent, default);
        Assert.False(result.HasActiveAccount); Assert.False(result.HasVisibleTransactions);
        Assert.Equal(0, result.UncategorizedSpendingCount);
        Assert.Equal(includeRecent ? 4 : 3, capture.Commands.Count);
        Assert.Contains("EXISTS", capture.Commands[0].Sql);
        Assert.Contains("EXISTS", capture.Commands[1].Sql);
        var count = capture.Commands[2].Sql;
        Assert.Contains("COUNT(*)", count); Assert.Contains("HouseholdId", count);
        Assert.Contains("IsVoided", count); Assert.Contains("IsExcludedFromBudget", count);
        Assert.Contains("TransactionDate", count); Assert.Contains("Currency", count);
        if (scope == "Personal") Assert.Contains("PersonalBudgetInclusions", count);
        foreach (var command in capture.Commands)
        {
            Assert.DoesNotContain("SUM(", command.Sql);
            Assert.DoesNotContain("Notes", command.Sql); Assert.DoesNotContain("MerchantName", command.Sql);
        }
        if (includeRecent)
        {
            Assert.Empty(result.Recent!);
            var recent = capture.Commands[3];
            Assert.Contains("TOP(", recent.Sql); Assert.Contains(5, recent.Parameters);
            Assert.Contains("ORDER BY", recent.Sql); Assert.Contains("[Id] DESC", recent.Sql);
            Assert.Contains("Shared expense (private account)", recent.Sql);
            Assert.Contains("Description", recent.Sql);
        }
        else
        {
            Assert.Null(result.Recent);
            Assert.DoesNotContain(capture.Commands, c => c.Sql.Contains("Description"));
        }
    }

    private sealed class NoConnection : DbConnectionInterceptor
    {
        public override ValueTask<InterceptionResult> ConnectionOpeningAsync(DbConnection connection,
            ConnectionEventData eventData, InterceptionResult result, CancellationToken cancellationToken = default) =>
            ValueTask.FromResult(InterceptionResult.Suppress());
    }
    private sealed class CommandCapture : DbCommandInterceptor
    {
        public List<(string Sql, object?[] Parameters)> Commands { get; } = [];
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command,
            CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
        {
            Commands.Add((command.CommandText, command.Parameters.Cast<DbParameter>().Select(p => p.Value).ToArray()));
            var table = new DataTable();
            if (command.CommandText.StartsWith("SELECT CASE"))
            { table.Columns.Add("value", typeof(bool)); table.Rows.Add(false); }
            else if (command.CommandText.StartsWith("SELECT COUNT(*)"))
            { table.Columns.Add("value", typeof(int)); table.Rows.Add(0); }
            return ValueTask.FromResult(InterceptionResult<DbDataReader>.SuppressWithResult(table.CreateDataReader()));
        }
    }
}
