using BudgetApp.Application.Budgets;
using BudgetApp.Domain.Budgeting;
using BudgetApp.Domain.Categories;
using BudgetApp.Domain.Transactions;
using BudgetApp.Infrastructure;
using BudgetApp.Infrastructure.Data;
using BudgetApp.Infrastructure.Email;
using BudgetApp.Profiling;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace BudgetApp.Tests.Integration;

public sealed class BudgetActualsParityTests
{
    [Theory]
    [InlineData(BudgetScope.Household, false, "CAD")]
    [InlineData(BudgetScope.Household, true, "CAD")]
    [InlineData(BudgetScope.Personal, false, "CAD")]
    [InlineData(BudgetScope.Personal, true, "CAD")]
    [InlineData(BudgetScope.Household, false, "USD")]
    [InlineData(BudgetScope.Personal, false, "USD")]
    [InlineData(BudgetScope.Household, false, "cad")]
    public async Task AllReads_ExactlyMatchOldAlgorithms_OnAdversarialData(BudgetScope scope, bool viewer, string currency)
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        using var provider = Services(connection);
        using var serviceScope = provider.CreateScope();
        var db = serviceScope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        await db.Database.EnsureCreatedAsync();
        var seed = await BudgetActualsFixture.Seed(db);
        var repo = serviceScope.ServiceProvider.GetRequiredService<IBudgetRepository>();
        var legacy = new LegacyBudgetActualsReader(db);
        var user = viewer ? seed.ViewerId : seed.OwnerId;
        var oldMonth = await legacy.Monthly(seed.HouseholdId, user, scope, currency);
        var month = await repo.GetActualsAsync(seed.HouseholdId, user, 2026, 1, scope, currency, default);
        Assert.Equal(oldMonth.AmountsByCategoryId.OrderBy(row => row.Key), month.AmountsByCategoryId.OrderBy(row => row.Key));
        Assert.Equal(oldMonth.UncategorizedAmount, month.UncategorizedAmount);
        Assert.Equal(oldMonth.CurrencyMismatchTransactionCount, month.CurrencyMismatchTransactionCount);
        var history = await repo.GetHistoricalActualsAsync(seed.HouseholdId, user, new(2025, 1, 1), new(2026, 12, 31), scope, currency, default);
        Assert.Equal((await legacy.Historical(seed.HouseholdId, user, scope, currency)).OrderBy(row => (row.Year, row.Month, row.CategoryId)),
            history.OrderBy(row => (row.Year, row.Month, row.CategoryId)));
        var oldAnnual = await legacy.Annual(seed.HouseholdId, user, scope, currency);
        var annual = await repo.GetAnnualActualsAsync(seed.HouseholdId, user, 2026, scope, currency, default);
        Assert.Equal(oldAnnual.CategoryMonths.OrderBy(row => (row.Month, row.CategoryId)), annual.CategoryMonths.OrderBy(row => (row.Month, row.CategoryId)));
        Assert.Equal(oldAnnual.CurrencyMismatchTransactionCount, annual.CurrencyMismatchTransactionCount);
        Assert.Empty(db.ChangeTracker.Entries()); // Reads do not track/write financial entities.
    }

    [Fact]
    public async Task AnnualPage_PreservesSeparateSigns_ZeroBudget_AbsentMonths_Rollups_AndInactiveCategories()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        using var provider = Services(connection);
        using var scope = provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        await db.Database.EnsureCreatedAsync();
        var seed = await BudgetActualsFixture.Seed(db);
        var overview = await scope.ServiceProvider.GetRequiredService<AnnualBudgetOverviewService>()
            .GetAsync(seed.HouseholdId, seed.ViewerId, 2026, "Household", default);
        var january = Assert.Single(overview.Months, row => row.Month == 1);
        Assert.Equal(367.9014m, january.ActualSpendingAmount);
        Assert.Equal(1002.5555m, january.IncomeAmount);
        var february = Assert.Single(overview.Months, row => row.Month == 2);
        Assert.Equal(10.0001m, february.ActualSpendingAmount);
        Assert.Equal(10m, february.IncomeAmount);
        Assert.Null(february.BudgetedAmount);
        Assert.Null(february.RemainingAmount);
        var root = Assert.Single(overview.Categories, row => row.Id == seed.RootId);
        Assert.Equal(348.1317m, root.ActualAmount);
        var child = Assert.Single(root.Children);
        Assert.Equal(0m, child.BudgetedAmount);
        Assert.Equal(343.1316m, child.ActualAmount);
        var inactive = Assert.Single(overview.Categories, row => row.Id == seed.InactiveId);
        Assert.False(inactive.IsActive);
        Assert.Equal(7.7777m, inactive.ActualAmount);
        Assert.Null(inactive.BudgetedAmount);
        Assert.Equal(35.1234m, overview.UncategorizedSpendingAmount);
        Assert.Equal(3, overview.CurrencyMismatchTransactionCount);
        var ownerPersonal = await scope.ServiceProvider.GetRequiredService<IBudgetRepository>()
            .GetActualsAsync(seed.HouseholdId, seed.OwnerId, 2026, 1, BudgetScope.Personal, "CAD", default);
        Assert.Equal(320.0002m, ownerPersonal.AmountsByCategoryId[seed.ChildId]);
        Assert.Equal(0m, ownerPersonal.UncategorizedAmount);
    }

    [Fact]
    public async Task EmptyPeriods_ReturnZeroTotalsAndNoInventedCategoryRows_AndHonorCancellation()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        using var provider = Services(connection);
        using var scope = provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        await db.Database.EnsureCreatedAsync();
        var repo = scope.ServiceProvider.GetRequiredService<IBudgetRepository>();
        var month = await repo.GetActualsAsync(Guid.NewGuid(), Guid.NewGuid(), 2026, 1, BudgetScope.Personal, "CAD", default);
        Assert.Empty(month.AmountsByCategoryId);
        Assert.Equal(0m, month.UncategorizedAmount);
        Assert.Equal(0, month.CurrencyMismatchTransactionCount);
        Assert.Empty((await repo.GetAnnualActualsAsync(Guid.NewGuid(), Guid.NewGuid(), 2026, BudgetScope.Household, "CAD", default)).CategoryMonths);
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => repo.GetHistoricalActualsAsync(Guid.NewGuid(), Guid.NewGuid(),
            new(2026, 1, 1), new(2026, 12, 31), BudgetScope.Household, "CAD", cancellation.Token));
    }

    private static ServiceProvider Services(SqliteConnection connection)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddInfrastructure("Server=unused;Database=unused;Integrated Security=True;", new EmailOptions(), new ApplicationUrlOptions(), false);
        services.RemoveAll<DbContextOptions<BudgetAppDbContext>>();
        services.RemoveAll<IDbContextOptionsConfiguration<BudgetAppDbContext>>();
        services.AddDbContext<BudgetAppDbContext>(options => options.UseSqlite(connection));
        return services.BuildServiceProvider();
    }

    [Fact]
    public async Task ThousandsOfFourDecimalTransactions_ReturnOneCategoryMonth_NotIndividualRows()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        using var provider = Services(connection);
        using var scope = provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        await db.Database.EnsureCreatedAsync();
        var seed = await BudgetActualsFixture.Seed(db);
        db.Transactions.AddRange(Enumerable.Range(0, 2000).Select(_ => Transaction.CreateManual(seed.HouseholdId,
            seed.SharedAccountId, seed.ChildId, new(2026, 1, 1), null, 0.0001m, "Synthetic precision test", null, null,
            false, seed.OwnerId, DateTimeOffset.UtcNow)));
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        var repo = scope.ServiceProvider.GetRequiredService<IBudgetRepository>();
        var month = await repo.GetActualsAsync(seed.HouseholdId, seed.OwnerId, 2026, 1, BudgetScope.Household, "CAD", default);
        Assert.Equal(330.2002m, month.AmountsByCategoryId[seed.ChildId]);
        Assert.Equal(3, month.AmountsByCategoryId.Count);
        var annual = await repo.GetAnnualActualsAsync(seed.HouseholdId, seed.OwnerId, 2026, BudgetScope.Household, "CAD", default);
        var categoryMonth = Assert.Single(annual.CategoryMonths, row => row.CategoryId == seed.ChildId && row.Month == 1);
        Assert.Equal(330.2002m, categoryMonth.SpendingAmount);
        Assert.Equal(0m, categoryMonth.IncomeAmount);
        Assert.Equal(8, annual.CategoryMonths.Count);
    }
}
