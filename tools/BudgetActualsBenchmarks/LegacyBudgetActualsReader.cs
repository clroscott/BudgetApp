using BudgetApp.Application.Budgets;
using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.Budgeting;
using BudgetApp.Domain.Categories;
using BudgetApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Profiling;

// Frozen pre-#210 read/materialization algorithms. Only normalization to the new
// annual result contract is added *after* loading the old per-transaction rows.
// Used for exact parity/profiling, never registered in the running application.
internal sealed class LegacyBudgetActualsReader(BudgetAppDbContext db)
{
    public async Task<BudgetActualsRecord> Monthly(Guid household, Guid user, BudgetScope scope, string currency)
    {
        var rows = await Rows(household, user, new(2026, 1, 1), new(2026, 1, 31), scope)
            .Where(row => row.CategoryType == null || row.CategoryType == CategoryType.Expense)
            .Select(row => new { row.CategoryId, row.Amount, row.Currency }).ToListAsync();
        var matching = rows.Where(row => string.Equals(row.Currency, currency, StringComparison.OrdinalIgnoreCase)).ToList();
        return new(matching.Where(row => row.CategoryId.HasValue).GroupBy(row => row.CategoryId!.Value)
            .ToDictionary(group => group.Key, group => group.Sum(row => row.Amount)),
            matching.Where(row => !row.CategoryId.HasValue).Sum(row => row.Amount),
            rows.Count(row => !string.Equals(row.Currency, currency, StringComparison.OrdinalIgnoreCase)));
    }
    public async Task<IReadOnlyList<BudgetHistoricalActualRecord>> Historical(Guid household, Guid user, BudgetScope scope, string currency)
    {
        var rows = await Rows(household, user, new(2025, 1, 1), new(2026, 12, 31), scope)
            .Where(row => row.CategoryType == CategoryType.Expense && row.Currency == currency)
            .Select(row => new { row.CategoryId, row.Date, row.Amount }).ToListAsync();
        return rows.GroupBy(row => new { row.CategoryId, row.Date.Year, row.Date.Month })
            .Select(group => new BudgetHistoricalActualRecord(group.Key.CategoryId!.Value,
                group.Key.Year, group.Key.Month, group.Sum(row => row.Amount))).ToList();
    }
    public async Task<AnnualBudgetActualsRecord> Annual(Guid household, Guid user, BudgetScope scope, string currency)
    {
        return (await AnnualRaw(household, user, scope, currency)).Normalize();
    }
    public async Task<LegacyAnnualActuals> AnnualRaw(Guid household, Guid user, BudgetScope scope, string currency)
    {
        var rows = await Rows(household, user, new(2026, 1, 1), new(2026, 12, 31), scope)
            .Select(row => new { row.Date.Month, row.CategoryId, row.CategoryType, row.Amount, row.Currency }).ToListAsync();
        return new(rows.Where(row => string.Equals(row.Currency, currency, StringComparison.OrdinalIgnoreCase))
            .Select(row => new LegacyAnnualRow(row.Month, row.CategoryId, row.CategoryType, row.Amount)).ToList(),
            rows.Count(row => !string.Equals(row.Currency, currency, StringComparison.OrdinalIgnoreCase)));
    }
    internal sealed record LegacyAnnualRow(int Month, Guid? CategoryId, CategoryType? CategoryType, decimal Amount);
    internal sealed record LegacyAnnualActuals(IReadOnlyList<LegacyAnnualRow> Transactions, int CurrencyMismatchTransactionCount)
    {
        public AnnualBudgetActualsRecord Normalize() => new(Transactions
            .GroupBy(row => new { row.Month, row.CategoryId, row.CategoryType })
            .Select(group => new AnnualCategoryMonthActualRecord(group.Key.Month, group.Key.CategoryId, group.Key.CategoryType,
                group.Sum(row => row.CategoryType == CategoryType.Expense ? row.Amount :
                    !row.CategoryId.HasValue && row.Amount > 0 ? row.Amount : 0m),
                group.Where(row => (row.CategoryType == CategoryType.Income || !row.CategoryId.HasValue) && row.Amount < 0)
                    .Sum(row => -row.Amount))).ToList(),
            CurrencyMismatchTransactionCount);
    }
    private IQueryable<Row> Rows(Guid household, Guid user, DateOnly fromDate, DateOnly toDate, BudgetScope scope) =>
        from transaction in db.Transactions.AsNoTracking()
        join account in db.Accounts.AsNoTracking() on transaction.AccountId equals account.Id
        join category in db.Categories.AsNoTracking() on transaction.CategoryId equals category.Id into categories
        from category in categories.DefaultIfEmpty()
        where transaction.HouseholdId == household && transaction.TransactionDate >= fromDate && transaction.TransactionDate <= toDate &&
            !transaction.IsVoided && !transaction.IsExcludedFromBudget &&
            (scope == BudgetScope.Household
                ? transaction.IncludeInHouseholdBudget == true || transaction.IncludeInHouseholdBudget == null && account.Scope == AccountScope.Household
                : (account.Scope == AccountScope.Household || account.OwnerUserId == user || transaction.IncludeInHouseholdBudget == true) &&
                  (transaction.PersonalBudgetInclusions.Any(item => item.UserId == user) ||
                   transaction.IncludeInHouseholdBudget == null && account.Scope == AccountScope.Personal && account.OwnerUserId == user))
        select new Row { Date = transaction.TransactionDate, CategoryId = transaction.CategoryId,
            CategoryType = category == null ? null : category.Type, Amount = transaction.Amount, Currency = account.Currency };
    private sealed class Row
    {
        public DateOnly Date { get; init; }
        public Guid? CategoryId { get; init; }
        public CategoryType? CategoryType { get; init; }
        public decimal Amount { get; init; }
        public string Currency { get; init; } = "";
    }
}
