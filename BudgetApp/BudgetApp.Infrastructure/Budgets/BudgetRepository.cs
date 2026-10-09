using BudgetApp.Application.Budgets;
using BudgetApp.Domain.Budgeting;
using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.Categories;
using BudgetApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Infrastructure.Budgets;

internal sealed class BudgetRepository(BudgetAppDbContext dbContext) : IBudgetRepository
{
    public Task<BudgetMonth?> GetAsync(
        Guid householdId,
        int year,
        int month,
        BudgetScope scope,
        Guid? ownerUserId,
        bool forUpdate,
        CancellationToken cancellationToken)
    {
        var query = dbContext.BudgetMonths.Include(budget => budget.Lines).AsQueryable();
        if (!forUpdate) query = query.AsNoTracking();
        return query.SingleOrDefaultAsync(budget =>
            budget.HouseholdId == householdId &&
            budget.Year == year &&
            budget.Month == month &&
            budget.Scope == scope &&
            budget.OwnerUserId == ownerUserId,
            cancellationToken);
    }

    public Task<BudgetMonth?> GetByIdForUpdateAsync(
        Guid householdId,
        Guid budgetId,
        Guid userId,
        CancellationToken cancellationToken) =>
        dbContext.BudgetMonths
            .Include(budget => budget.Lines)
            .SingleOrDefaultAsync(budget =>
                budget.Id == budgetId &&
                budget.HouseholdId == householdId &&
                (budget.Scope == BudgetScope.Household || budget.OwnerUserId == userId),
                cancellationToken);

    public async Task<IReadOnlyList<BudgetMonthOption>> ListAvailableAsync(
        Guid householdId,
        BudgetScope scope,
        Guid? ownerUserId,
        CancellationToken cancellationToken) =>
        (await dbContext.BudgetMonths
            .AsNoTracking()
            .Where(budget =>
                budget.HouseholdId == householdId &&
                budget.Scope == scope &&
                budget.OwnerUserId == ownerUserId)
            .OrderByDescending(budget => budget.Year)
            .ThenByDescending(budget => budget.Month)
            .Select(budget => new
            {
                budget.Id,
                budget.Year,
                budget.Month,
                budget.Status
            })
            .ToListAsync(cancellationToken))
        .Select(budget => new BudgetMonthOption(
            budget.Id, budget.Year, budget.Month, budget.Status.ToString()))
        .ToList();

    public async Task<IReadOnlyList<BudgetMonth>> ListYearAsync(
        Guid householdId,
        int year,
        BudgetScope scope,
        Guid? ownerUserId,
        CancellationToken cancellationToken) =>
        await dbContext.BudgetMonths
            .AsNoTracking()
            .Include(budget => budget.Lines)
            .Where(budget =>
                budget.HouseholdId == householdId &&
                budget.Year == year &&
                budget.Scope == scope &&
                budget.OwnerUserId == ownerUserId)
            .OrderBy(budget => budget.Month)
            .ToListAsync(cancellationToken);

    public Task<string?> GetHouseholdCurrencyAsync(
        Guid householdId,
        CancellationToken cancellationToken) =>
        dbContext.Households
            .Where(household => household.Id == householdId && household.IsActive)
            .Select(household => household.DefaultCurrency)
            .SingleOrDefaultAsync(cancellationToken);

    public async Task<IReadOnlyList<BudgetCategoryRecord>> ListExpenseCategoriesAsync(
        Guid householdId,
        CancellationToken cancellationToken) =>
        await dbContext.Categories
            .AsNoTracking()
            .Where(category =>
                category.HouseholdId == householdId &&
                category.Type == CategoryType.Expense)
            .Select(category => new BudgetCategoryRecord(
                category.Id,
                category.Name,
                category.ParentCategoryId,
                category.DisplayOrder,
                category.IsActive))
            .ToListAsync(cancellationToken);

    public async Task<BudgetActualsRecord> GetActualsAsync(
        Guid householdId,
        Guid userId,
        int year,
        int month,
        BudgetScope scope,
        string currency,
        CancellationToken cancellationToken)
    {
        var firstDay = new DateOnly(year, month, 1);
        var lastDay = new DateOnly(year, month, DateTime.DaysInMonth(year, month));
        var totals = await ActualRows(householdId, userId, firstDay, lastDay, scope)
            .Where(row => row.CategoryType == null || row.CategoryType == CategoryType.Expense)
            .GroupBy(row => new { row.Currency, row.CategoryId })
            .Select(group => new
            {
                group.Key.Currency,
                group.Key.CategoryId,
                Amount = group.Sum(row => row.Amount),
                Count = group.Count()
            })
            .ToListAsync(cancellationToken);

        // Currency comparison keeps its existing ordinal, case-insensitive
        // meaning over bounded SQL summaries, never over individual transactions.
        var matchingCurrency = totals
            .Where(transaction => string.Equals(
                transaction.Currency, currency, StringComparison.OrdinalIgnoreCase))
            .ToList();
        var amounts = matchingCurrency
            .Where(transaction => transaction.CategoryId.HasValue)
            .GroupBy(transaction => transaction.CategoryId!.Value)
            .ToDictionary(group => group.Key, group => group.Sum(item => item.Amount));
        var uncategorized = matchingCurrency
            .Where(transaction => !transaction.CategoryId.HasValue)
            .Sum(transaction => transaction.Amount);
        var mismatchCount = totals.Where(row => !string.Equals(
            row.Currency, currency, StringComparison.OrdinalIgnoreCase)).Sum(row => row.Count);

        return new BudgetActualsRecord(amounts, uncategorized, mismatchCount);
    }

    public async Task<IReadOnlyList<BudgetHistoricalActualRecord>> GetHistoricalActualsAsync(
        Guid householdId,
        Guid userId,
        DateOnly fromDate,
        DateOnly toDate,
        BudgetScope scope,
        string currency,
        CancellationToken cancellationToken)
    {
        return await ActualRows(householdId, userId, fromDate, toDate, scope)
            .Where(row => row.CategoryType == CategoryType.Expense && row.Currency == currency)
            .GroupBy(row => new
            {
                row.CategoryId,
                row.TransactionDate.Year,
                row.TransactionDate.Month
            })
            .Select(group => new BudgetHistoricalActualRecord(
                group.Key.CategoryId!.Value,
                group.Key.Year,
                group.Key.Month,
                group.Sum(row => row.Amount)))
            .ToListAsync(cancellationToken);
    }

    public async Task<AnnualBudgetActualsRecord> GetAnnualActualsAsync(
        Guid householdId,
        Guid userId,
        int year,
        BudgetScope scope,
        string currency,
        CancellationToken cancellationToken)
    {
        var fromDate = new DateOnly(year, 1, 1);
        var toDate = new DateOnly(year, 12, 31);
        var totals = await ActualRows(householdId, userId, fromDate, toDate, scope)
            .GroupBy(row => new { row.Currency, row.TransactionDate.Month, row.CategoryId, row.CategoryType })
            .Select(group => new
            {
                group.Key.Currency,
                group.Key.Month,
                group.Key.CategoryId,
                group.Key.CategoryType,
                SpendingAmount = group.Sum(row => row.CategoryType == CategoryType.Expense
                    ? row.Amount : row.CategoryId == null && row.Amount > 0m ? row.Amount : 0m),
                IncomeAmount = group.Sum(row => (row.CategoryType == CategoryType.Income || row.CategoryId == null) && row.Amount < 0m
                    ? -row.Amount : 0m),
                Count = group.Count()
            })
            .ToListAsync(cancellationToken);

        var matchingCurrency = totals
            .Where(row => string.Equals(row.Currency, currency, StringComparison.OrdinalIgnoreCase))
            .GroupBy(row => new { row.Month, row.CategoryId, row.CategoryType })
            .Select(group => new AnnualCategoryMonthActualRecord(
                group.Key.Month, group.Key.CategoryId, group.Key.CategoryType,
                group.Sum(row => row.SpendingAmount), group.Sum(row => row.IncomeAmount)))
            .ToList();
        return new AnnualBudgetActualsRecord(matchingCurrency,
            totals.Where(row => !string.Equals(row.Currency, currency, StringComparison.OrdinalIgnoreCase)).Sum(row => row.Count));
    }

    private IQueryable<ActualRow> ActualRows(Guid householdId, Guid userId,
        DateOnly fromDate, DateOnly toDate, BudgetScope scope) =>
            from transaction in dbContext.Transactions.AsNoTracking()
            join account in dbContext.Accounts.AsNoTracking()
                on transaction.AccountId equals account.Id
            join category in dbContext.Categories.AsNoTracking()
                on transaction.CategoryId equals category.Id into categories
            from category in categories.DefaultIfEmpty()
            where transaction.HouseholdId == householdId &&
                  transaction.TransactionDate >= fromDate &&
                  transaction.TransactionDate <= toDate &&
                  !transaction.IsVoided &&
                  !transaction.IsExcludedFromBudget &&
                  (scope == BudgetScope.Household
                      ? transaction.IncludeInHouseholdBudget == true ||
                        transaction.IncludeInHouseholdBudget == null && account.Scope == AccountScope.Household
                      : (account.Scope == AccountScope.Household || account.OwnerUserId == userId ||
                         transaction.IncludeInHouseholdBudget == true) &&
                        (transaction.PersonalBudgetInclusions.Any(item => item.UserId == userId) ||
                         transaction.IncludeInHouseholdBudget == null &&
                         account.Scope == AccountScope.Personal && account.OwnerUserId == userId))
            select new ActualRow
            {
                TransactionDate = transaction.TransactionDate,
                CategoryId = transaction.CategoryId,
                CategoryType = category == null
                    ? (CategoryType?)null
                    : category.Type,
                Amount = transaction.Amount,
                Currency = account.Currency
            };

    // Member initialization keeps this projection composable by EF's SQL
    // translator; no row instances are materialized before the GROUP BY.
    private sealed class ActualRow
    {
        public DateOnly TransactionDate { get; init; }
        public Guid? CategoryId { get; init; }
        public CategoryType? CategoryType { get; init; }
        public decimal Amount { get; init; }
        public string Currency { get; init; } = string.Empty;
    }

    public async Task AddAsync(BudgetMonth budgetMonth, CancellationToken cancellationToken) =>
        await dbContext.BudgetMonths.AddAsync(budgetMonth, cancellationToken);

    public async Task AddLineAsync(BudgetLine budgetLine, CancellationToken cancellationToken) =>
        await dbContext.BudgetLines.AddAsync(budgetLine, cancellationToken);

    public void Remove(BudgetMonth budgetMonth) =>
        dbContext.BudgetMonths.Remove(budgetMonth);

    public Task SaveChangesAsync(CancellationToken cancellationToken) =>
        dbContext.SaveChangesAsync(cancellationToken);
}
