using System.Data.Common;
using System.Text.Json;
using BudgetApp.Application.Accounts;
using BudgetApp.Application.Budgets;
using BudgetApp.Application.Dashboards;
using BudgetApp.Application.Households;
using BudgetApp.Application.Imports;
using BudgetApp.Application.Transactions;
using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.Budgeting;
using BudgetApp.Domain.Households;
using BudgetApp.Domain.Imports;
using BudgetApp.Domain.Transactions;
using BudgetApp.Infrastructure;
using BudgetApp.Infrastructure.Data;
using BudgetApp.Infrastructure.Email;
using BudgetApp.Infrastructure.Identity;
using BudgetApp.Profiling;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit.Abstractions;

namespace BudgetApp.Tests.Integration;

public sealed class DashboardSummaryTests(ITestOutputHelper output)
{
    private static readonly DateTimeOffset Now = new(2026, 10, 8, 12, 0, 0, TimeSpan.Zero);

    [Theory]
    [InlineData("Household", false, 1)]
    [InlineData("Household", true, 1)]
    [InlineData("Personal", false, 1)]
    [InlineData("Personal", true, 1)]
    [InlineData("Household", false, 2)]
    [InlineData("Household", false, 3)]
    [InlineData("Household", false, 12)]
    public async Task Summary_ReconcilesWithEditorAndDrilldowns_WithoutHistoryOrDetailedLists(string scope, bool viewer, int month)
    {
        await using var test = await Context.Create();
        var seed = await BudgetActualsFixture.Seed(test.Db);
        var user = viewer ? seed.ViewerId : seed.OwnerId;
        var editor = await test.Get<BudgetManagementService>().GetAsync(seed.HouseholdId, user, 2026, month, scope, default);
        var uncategorized = await Transactions(test, seed.HouseholdId, user, month, scope, editor.Currency, true);
        var recent = await Transactions(test, seed.HouseholdId, user);
        test.Capture.Commands.Clear();
        var summary = await test.Get<DashboardSummaryService>().GetAsync(seed.HouseholdId, user, 2026, month, scope, false, default);
        var expectedBudgeted = editor.Categories.Sum(root => root.Children.Any(child => child.BudgetedAmount.HasValue)
            ? root.Children.Sum(child => child.BudgetedAmount ?? 0m) : root.BudgetedAmount ?? 0m);
        Assert.Equal(editor.Id, summary.Budget.Id);
        Assert.Equal(editor.Status, summary.Budget.Status);
        Assert.Equal(editor.Currency, summary.Budget.Currency);
        Assert.Equal(editor.Scope, summary.Budget.Scope);
        Assert.Equal(expectedBudgeted, summary.Budget.BudgetedAmount);
        Assert.Equal(editor.Categories.Sum(root => root.ActualAmount), summary.Budget.ActualAmount);
        Assert.Equal(summary.Budget.BudgetedAmount - summary.Budget.ActualAmount, summary.Budget.RemainingAmount);
        Assert.Equal(editor.UncategorizedActualAmount, summary.Budget.UncategorizedActualAmount);
        Assert.Equal(editor.CurrencyMismatchTransactionCount, summary.Budget.CurrencyMismatchTransactionCount);
        Assert.Equal(uncategorized.TotalCount, summary.UncategorizedSpendingCount);
        Assert.Equal(recent.TotalCount > 0, summary.HasVisibleTransactions);
        Assert.True(summary.HasActiveAccount);
        Assert.Null(summary.Recent);
        Assert.DoesNotContain(test.Capture.Commands, sql => sql.Contains("YearlyPlans") || sql.Contains("Description"));
        Assert.Empty(test.Db.ChangeTracker.Entries());
        if (month == 1 && scope == "Household")
        {
            Assert.Equal(0m, summary.Budget.BudgetedAmount); // Explicit child zero replaces parent, not vice versa.
            Assert.Equal(342.7780m, summary.Budget.ActualAmount);
            Assert.Equal(23m, summary.Budget.UncategorizedActualAmount); // Monthly signed net, including the refund.
            Assert.Equal(1, summary.UncategorizedSpendingCount); // Attention only counts positive uncategorized spending.
            Assert.Equal(2, summary.Budget.CurrencyMismatchTransactionCount); // Transactions, not currency groups.
        }
    }

    [Fact]
    public async Task Recent_IsOptInLimitedStableAndMasksAnotherMembersPrivateAccount()
    {
        await using var test = await Context.Create();
        var seed = await BudgetActualsFixture.Seed(test.Db);
        var privateAccount = await test.Db.Accounts.SingleAsync(a => a.OwnerUserId == seed.ViewerId);
        var sharedExpense = Transaction.CreateManual(seed.HouseholdId, privateAccount.Id, seed.ChildId,
            new(2030, 1, 1), null, 1.2345m, "Shared synthetic expense", "Private merchant", "Private notes", false, seed.ViewerId, Now);
        sharedExpense.InitializeBudgetInclusion(false, seed.ViewerId);
        sharedExpense.SetBudgetInclusionForUser(seed.ViewerId, true, true, Now);
        test.Db.Transactions.Add(sharedExpense);
        await test.Db.SaveChangesAsync();
        test.Db.ChangeTracker.Clear();
        var old = await Transactions(test, seed.HouseholdId, seed.OwnerId);
        var summary = await test.Get<DashboardSummaryService>().GetAsync(seed.HouseholdId, seed.OwnerId, 2026, 1, "Personal", true, default);
        Assert.NotNull(summary.Recent);
        Assert.Equal(old.Items.Take(5).Select(r => r.Id), summary.Recent!.Select(r => r.Id));
        Assert.Equal(5, summary.Recent.Count);
        var masked = summary.Recent[0];
        Assert.Equal(sharedExpense.Id, masked.Id);
        Assert.Equal("Shared expense (private account)", masked.AccountName);
        Assert.Equal(1.2345m, masked.Amount);
        var json = JsonSerializer.Serialize(summary);
        Assert.DoesNotContain("Private notes", json);
        Assert.DoesNotContain("Private merchant", json);
        Assert.DoesNotContain("Viewer CAD", json);
        Assert.Equal(summary.Recent, (await test.Get<DashboardSummaryService>()
            .GetAsync(seed.HouseholdId, seed.OwnerId, 2026, 1, "Household", true, default)).Recent);
    }

    [Fact]
    public async Task ExactImportCountsAndPresenceFlags_AreUserSpecific_NotCachedAcrossMembers()
    {
        await using var test = await Context.Create();
        var seed = await BudgetActualsFixture.Seed(test.Db);
        var accounts = await test.Db.Accounts.Where(a => a.HouseholdId == seed.HouseholdId).ToListAsync();
        var own = accounts.Single(a => a.OwnerUserId == seed.OwnerId);
        var other = accounts.Single(a => a.OwnerUserId == seed.ViewerId);
        AddImports(test.Db, seed.HouseholdId, seed.OwnerId, seed.SharedAccountId, 120);
        AddImports(test.Db, seed.HouseholdId, seed.OwnerId, own.Id, 7);
        AddImports(test.Db, seed.HouseholdId, seed.ViewerId, other.Id, 13);
        await test.Db.SaveChangesAsync();
        test.Db.ChangeTracker.Clear();
        var service = test.Get<DashboardSummaryService>();
        Assert.Equal(127, (await service.GetAsync(seed.HouseholdId, seed.OwnerId, 2026, 1, "Household", false, default)).ReadyForReviewCount);
        Assert.Equal(133, (await service.GetAsync(seed.HouseholdId, seed.ViewerId, 2026, 1, "Household", false, default)).ReadyForReviewCount);
        Assert.Equal(127, (await service.GetAsync(seed.HouseholdId, seed.OwnerId, 2026, 1, "Household", false, default)).ReadyForReviewCount);
    }

    [Fact]
    public async Task EmptyHousehold_AndSavedZeroBudget_AreDistinct_AndNoAccessNeverLooksEmpty()
    {
        await using var test = await Context.Create();
        var user = new ApplicationUser { Id = Guid.NewGuid(), DisplayName = "Synthetic empty owner" };
        var household = Household.Create("Synthetic empty household", "USD", "UTC", user.Id, Now);
        test.Db.Users.Add(user); test.Db.Households.Add(household);
        await test.Db.SaveChangesAsync();
        var service = test.Get<DashboardSummaryService>();
        var empty = await service.GetAsync(household.Id, user.Id, 2026, 1, "Personal", true, default);
        Assert.Null(empty.Budget.Id);
        Assert.Equal("USD", empty.Budget.Currency);
        Assert.False(empty.HasActiveAccount); Assert.False(empty.HasVisibleTransactions);
        Assert.Equal(0, empty.UncategorizedSpendingCount); Assert.Equal(0, empty.ReadyForReviewCount);
        Assert.Empty(empty.Recent!);
        var budget = BudgetMonth.CreatePersonal(household.Id, user.Id, 2026, 1, "USD", Now);
        test.Db.BudgetMonths.Add(budget);
        await test.Db.SaveChangesAsync();
        var zero = await service.GetAsync(household.Id, user.Id, 2026, 1, "Personal", false, default);
        Assert.Equal(budget.Id, zero.Budget.Id);
        Assert.Equal(0m, zero.Budget.BudgetedAmount); Assert.Equal(0m, zero.Budget.ActualAmount);
        await Assert.ThrowsAsync<HouseholdAccessDeniedException>(() => service.GetAsync(household.Id, Guid.NewGuid(), 2026, 1, "Household", false, default));
        await Assert.ThrowsAsync<ArgumentException>(() => service.GetAsync(household.Id, user.Id, 2026, 1, "NotIncluded", false, default));
        await Assert.ThrowsAsync<ArgumentOutOfRangeException>(() => service.GetAsync(household.Id, user.Id, 2026, 13, "Household", false, default));
        using var cancellation = new CancellationTokenSource(); cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => service.GetAsync(household.Id, user.Id, 2026, 1, "Household", false, cancellation.Token));
    }

    [Fact]
    public async Task HiddenCard_StillHasAccurateSetupFlags_WithoutLeakingPrivateAccountsOrTransactions()
    {
        await using var test = await Context.Create();
        var seed = await BudgetActualsFixture.Seed(test.Db);
        await test.Db.Transactions.ExecuteDeleteAsync();
        await test.Db.BudgetMonths.ExecuteDeleteAsync();
        foreach (var account in await test.Db.Accounts.Where(a => a.HouseholdId == seed.HouseholdId && a.OwnerUserId != seed.ViewerId).ToListAsync())
            account.Archive(Now);
        var privateAccount = await test.Db.Accounts.SingleAsync(a => a.OwnerUserId == seed.ViewerId);
        test.Db.Transactions.Add(Transaction.CreateManual(seed.HouseholdId, privateAccount.Id, null, new(2026, 1, 1), null,
            10m, "Private only", null, null, false, seed.ViewerId, Now));
        await test.Db.SaveChangesAsync(); test.Db.ChangeTracker.Clear();
        var owner = await test.Get<DashboardSummaryService>().GetAsync(seed.HouseholdId, seed.OwnerId, 2026, 1, "Household", false, default);
        Assert.False(owner.HasActiveAccount); Assert.False(owner.HasVisibleTransactions); Assert.Null(owner.Recent);
        var viewer = await test.Get<DashboardSummaryService>().GetAsync(seed.HouseholdId, seed.ViewerId, 2026, 1, "Household", false, default);
        Assert.True(viewer.HasActiveAccount); Assert.True(viewer.HasVisibleTransactions);
    }

    [Fact]
    public async Task RecordBeforeAfterQueryCountsAndJsonBytes_WithDisposableSyntheticHistory()
    {
        await using var test = await Context.Create();
        var seed = await BudgetActualsFixture.Seed(test.Db);
        test.Db.Transactions.AddRange(Enumerable.Range(0, 1000).Select(i => Transaction.CreateManual(
            seed.HouseholdId, seed.SharedAccountId, i % 2 == 0 ? seed.ChildId : null, new(2026, 1, 15), null,
            23.4567m, $"Synthetic purchase {i:D4} " + new string('x', 80), null, new string('n', 100), false, seed.OwnerId, Now)));
        AddImports(test.Db, seed.HouseholdId, seed.OwnerId, seed.SharedAccountId, 120);
        await test.Db.SaveChangesAsync(); test.Db.ChangeTracker.Clear();
        test.Capture.Commands.Clear();
        var budget = await test.Get<BudgetManagementService>().GetAsync(seed.HouseholdId, seed.OwnerId, 2026, 1, "Household", default);
        var accounts = await test.Get<AccountManagementService>().ListAsync(seed.HouseholdId, seed.OwnerId, default);
        var imports = await test.Get<ImportReviewService>().GetSummaryAsync(seed.HouseholdId, seed.OwnerId, default);
        var recent = await Transactions(test, seed.HouseholdId, seed.OwnerId);
        var uncategorized = await Transactions(test, seed.HouseholdId, seed.OwnerId, 1, "Household", budget.Currency, true);
        var oldQueries = test.Capture.Commands.Count;
        var oldBytes = Bytes(budget) + Bytes(accounts) + Bytes(imports) + Bytes(recent) + Bytes(uncategorized);
        test.Capture.Commands.Clear();
        var hidden = await test.Get<DashboardSummaryService>().GetAsync(seed.HouseholdId, seed.OwnerId, 2026, 1, "Household", false, default);
        var hiddenQueries = test.Capture.Commands.Count;
        var hiddenBytes = Bytes(hidden);
        test.Capture.Commands.Clear();
        var shown = await test.Get<DashboardSummaryService>().GetAsync(seed.HouseholdId, seed.OwnerId, 2026, 1, "Household", true, default);
        var shownQueries = test.Capture.Commands.Count;
        output.WriteLine($"Synthetic 1,027 transactions / 120 ready imports: baseline requests=5, SQL queries={oldQueries}, JSON bytes={oldBytes}, detailed rows={recent.Items.Count + uncategorized.Items.Count}; hidden recent requests=1, SQL queries={hiddenQueries}, JSON bytes={hiddenBytes}, detailed rows=0; shown recent requests=1, SQL queries={shownQueries}, JSON bytes={Bytes(shown)}, detailed rows={shown.Recent!.Count}.");
        Assert.True(hiddenQueries < oldQueries); Assert.Equal(hiddenQueries + 1, shownQueries);
        Assert.True(hiddenBytes < oldBytes);
        Assert.Equal(5, shown.Recent.Count);
        Assert.Equal(120, hidden.ReadyForReviewCount);
        Assert.Equal(501, hidden.UncategorizedSpendingCount);
    }

    private static int Bytes<T>(T value) => JsonSerializer.SerializeToUtf8Bytes(value, new JsonSerializerOptions(JsonSerializerDefaults.Web)).Length;

    private static Task<TransactionListResult> Transactions(Context test, Guid household, Guid user,
        int? month = null, string? scope = null, string? currency = null, bool uncategorized = false) =>
        test.Get<TransactionManagementService>().ListAsync(household, user, null,
            month.HasValue ? new DateOnly(2026, month.Value, 1) : null,
            month.HasValue ? new DateOnly(2026, month.Value, DateTime.DaysInMonth(2026, month.Value)) : null,
            null, null, uncategorized, null, 1, default, scope, currency, month.HasValue);

    private static void AddImports(BudgetAppDbContext db, Guid household, Guid user, Guid account, int count)
    {
        for (var i = 0; i < count; i++)
        {
            var file = ImportFile.Create(household, account, user, "synthetic.csv", 100, Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N"), Now);
            file.StartProcessing(Now); file.MarkReadyForReview(new ImportStatistics(1, 1, 0, 0, 0, 0), Now);
            db.ImportFiles.Add(file);
        }
    }

    private sealed class CommandCapture : DbCommandInterceptor
    {
        public List<string> Commands { get; } = [];
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command,
            CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
        { Commands.Add(command.CommandText); return ValueTask.FromResult(result); }
    }

    private sealed class Context : IAsyncDisposable
    {
        private readonly SqliteConnection connection = new("Data Source=:memory:");
        private ServiceProvider provider = null!;
        private IServiceScope scope = null!;
        public CommandCapture Capture { get; } = new();
        public BudgetAppDbContext Db => Get<BudgetAppDbContext>();
        public T Get<T>() where T : notnull => scope.ServiceProvider.GetRequiredService<T>();
        public static async Task<Context> Create()
        {
            var test = new Context(); await test.connection.OpenAsync();
            var services = new ServiceCollection(); services.AddLogging();
            services.AddInfrastructure("Server=unused;Database=unused;Integrated Security=True;", new EmailOptions(), new ApplicationUrlOptions(), false);
            services.RemoveAll<DbContextOptions<BudgetAppDbContext>>();
            services.RemoveAll<IDbContextOptionsConfiguration<BudgetAppDbContext>>();
            services.AddDbContext<BudgetAppDbContext>(options => options.UseSqlite(test.connection).AddInterceptors(test.Capture));
            test.provider = services.BuildServiceProvider(); test.scope = test.provider.CreateScope();
            await test.Db.Database.EnsureCreatedAsync();
            return test;
        }
        public async ValueTask DisposeAsync() { scope.Dispose(); await provider.DisposeAsync(); await connection.DisposeAsync(); }
    }
}
