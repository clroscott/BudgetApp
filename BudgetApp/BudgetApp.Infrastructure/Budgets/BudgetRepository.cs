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
        var transactions = await (
            from transaction in dbContext.Transactions.AsNoTracking()
            join account in dbContext.Accounts.AsNoTracking()
                on transaction.AccountId equals account.Id
            join category in dbContext.Categories.AsNoTracking()
                on transaction.CategoryId equals category.Id into categories
            from category in categories.DefaultIfEmpty()
            where transaction.HouseholdId == householdId &&
                  transaction.TransactionDate >= firstDay &&
                  transaction.TransactionDate <= lastDay &&
                  !transaction.IsVoided &&
                  !transaction.IsExcludedFromBudget &&
                  (scope == BudgetScope.Household
                      ? account.Scope == AccountScope.Household
                      : account.Scope == AccountScope.Personal && account.OwnerUserId == userId) &&
                  (category == null || category.Type == CategoryType.Expense)
            select new
            {
                transaction.CategoryId,
                transaction.Amount,
                account.Currency
            })
            .ToListAsync(cancellationToken);

        var matchingCurrency = transactions
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
        var mismatchCount = transactions.Count(transaction => !string.Equals(
            transaction.Currency, currency, StringComparison.OrdinalIgnoreCase));

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
        var transactions = await (
            from transaction in dbContext.Transactions.AsNoTracking()
            join account in dbContext.Accounts.AsNoTracking()
                on transaction.AccountId equals account.Id
            join category in dbContext.Categories.AsNoTracking()
                on transaction.CategoryId equals category.Id
            where transaction.HouseholdId == householdId &&
                  transaction.TransactionDate >= fromDate &&
                  transaction.TransactionDate <= toDate &&
                  !transaction.IsVoided &&
                  !transaction.IsExcludedFromBudget &&
                  category.Type == CategoryType.Expense &&
                  account.Currency == currency &&
                  (scope == BudgetScope.Household
                      ? account.Scope == AccountScope.Household
                      : account.Scope == AccountScope.Personal && account.OwnerUserId == userId)
            select new
            {
                transaction.CategoryId,
                transaction.TransactionDate,
                transaction.Amount
            })
            .ToListAsync(cancellationToken);

        return transactions
            .GroupBy(transaction => new
            {
                CategoryId = transaction.CategoryId!.Value,
                transaction.TransactionDate.Year,
                transaction.TransactionDate.Month
            })
            .Select(group => new BudgetHistoricalActualRecord(
                group.Key.CategoryId,
                group.Key.Year,
                group.Key.Month,
                group.Sum(transaction => transaction.Amount)))
            .ToList();
    }

    public async Task<AnnualTransactionActualsRecord> GetAnnualTransactionsAsync(
        Guid householdId,
        Guid userId,
        int year,
        BudgetScope scope,
        string currency,
        CancellationToken cancellationToken)
    {
        var fromDate = new DateOnly(year, 1, 1);
        var toDate = new DateOnly(year, 12, 31);
        var transactions = await (
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
                      ? account.Scope == AccountScope.Household
                      : account.Scope == AccountScope.Personal &&
                        account.OwnerUserId == userId)
            select new
            {
                transaction.TransactionDate.Month,
                transaction.CategoryId,
                CategoryType = category == null
                    ? (CategoryType?)null
                    : category.Type,
                transaction.Amount,
                account.Currency
            })
            .ToListAsync(cancellationToken);

        var matchingCurrency = transactions
            .Where(transaction => string.Equals(
                transaction.Currency,
                currency,
                StringComparison.OrdinalIgnoreCase))
            .Select(transaction => new AnnualTransactionRecord(
                transaction.Month,
                transaction.CategoryId,
                transaction.CategoryType,
                transaction.Amount))
            .ToList();
        return new AnnualTransactionActualsRecord(
            matchingCurrency,
            transactions.Count(transaction => !string.Equals(
                transaction.Currency,
                currency,
                StringComparison.OrdinalIgnoreCase)));
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
