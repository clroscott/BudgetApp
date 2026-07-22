using BudgetApp.Application.Budgets;
using BudgetApp.Domain.Budgeting;
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

    public async Task AddAsync(BudgetMonth budgetMonth, CancellationToken cancellationToken) =>
        await dbContext.BudgetMonths.AddAsync(budgetMonth, cancellationToken);

    public async Task AddLineAsync(BudgetLine budgetLine, CancellationToken cancellationToken) =>
        await dbContext.BudgetLines.AddAsync(budgetLine, cancellationToken);

    public void Remove(BudgetMonth budgetMonth) =>
        dbContext.BudgetMonths.Remove(budgetMonth);

    public Task SaveChangesAsync(CancellationToken cancellationToken) =>
        dbContext.SaveChangesAsync(cancellationToken);
}
