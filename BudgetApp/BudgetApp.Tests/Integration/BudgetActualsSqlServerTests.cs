using System.Data;
using System.Data.Common;
using BudgetApp.Application.Budgets;
using BudgetApp.Domain.Budgeting;
using BudgetApp.Infrastructure;
using BudgetApp.Infrastructure.Data;
using BudgetApp.Infrastructure.Email;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;

namespace BudgetApp.Tests.Integration;

public sealed class BudgetActualsSqlServerTests
{
    [Theory]
    [InlineData(BudgetScope.Household)]
    [InlineData(BudgetScope.Personal)]
    public async Task AllThreeReads_GroupAndSumExactDecimalsInSql_BeforeMaterialization(BudgetScope scope)
    {
        var capture = new GroupCommandCapture();
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddInfrastructure("Server=unused;Database=unused;Integrated Security=True;", new EmailOptions(), new ApplicationUrlOptions(), false);
        services.AddDbContext<BudgetAppDbContext>(options => options.AddInterceptors(new NoConnection(), capture));
        using var provider = services.BuildServiceProvider();
        using var serviceScope = provider.CreateScope();
        var repo = serviceScope.ServiceProvider.GetRequiredService<IBudgetRepository>();
        var household = Guid.NewGuid(); var user = Guid.NewGuid();
        Assert.Empty((await repo.GetActualsAsync(household, user, 2026, 1, scope, "CAD", default)).AmountsByCategoryId);
        Assert.Empty(await repo.GetHistoricalActualsAsync(household, user, new(2025, 1, 1), new(2026, 12, 31), scope, "CAD", default));
        Assert.Empty((await repo.GetAnnualActualsAsync(household, user, 2026, scope, "CAD", default)).CategoryMonths);
        Assert.Equal(3, capture.Commands.Count);
        foreach (var sql in capture.Commands)
        {
            Assert.Contains("GROUP BY", sql);
            Assert.Contains("SUM(", sql);
            Assert.Contains("HouseholdId", sql);
            Assert.Contains("IsVoided", sql);
            Assert.Contains("IsExcludedFromBudget", sql);
            Assert.Contains("IncludeInHouseholdBudget", sql);
            if (scope == BudgetScope.Personal) Assert.Contains("PersonalBudgetInclusions", sql);
            Assert.DoesNotContain("float", sql, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("OFFSET", sql);
            Assert.DoesNotContain("Description", sql);
        }
        Assert.Contains("DATEPART(year", capture.Commands[1]);
        Assert.Contains("DATEPART(month", capture.Commands[1]);
        Assert.Contains("CASE", capture.Commands[2]); // Separate positive/negative sums.
        Assert.Contains("COUNT(*)", capture.Commands[2]); // Mismatch count, not count of groups.
    }
    private sealed class NoConnection : DbConnectionInterceptor
    {
        public override ValueTask<InterceptionResult> ConnectionOpeningAsync(DbConnection connection,
            ConnectionEventData eventData, InterceptionResult result, CancellationToken cancellationToken = default) =>
            ValueTask.FromResult(InterceptionResult.Suppress());
    }
    private sealed class GroupCommandCapture : DbCommandInterceptor
    {
        public List<string> Commands { get; } = [];
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command,
            CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
        {
            Commands.Add(command.CommandText);
            return ValueTask.FromResult(InterceptionResult<DbDataReader>.SuppressWithResult(new DataTable().CreateDataReader()));
        }
    }
}
