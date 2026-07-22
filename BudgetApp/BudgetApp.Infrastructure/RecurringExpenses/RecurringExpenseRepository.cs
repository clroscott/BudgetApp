using BudgetApp.Application.RecurringExpenses;
using BudgetApp.Domain.RecurringExpenses;
using BudgetApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Infrastructure.RecurringExpenses;

internal sealed class RecurringExpenseRepository(BudgetAppDbContext dbContext)
    : IRecurringExpenseRepository
{
    public async Task<IReadOnlyList<RecurringExpenseRecord>> ListVisibleAsync(
        Guid householdId,
        Guid userId,
        CancellationToken cancellationToken)
    {
        return await (
            from expense in dbContext.RecurringExpenses.AsNoTracking()
            join subcategory in dbContext.Categories.AsNoTracking()
                on expense.CategoryId equals subcategory.Id
            join category in dbContext.Categories.AsNoTracking()
                on subcategory.ParentCategoryId equals category.Id
            join account in dbContext.Accounts.AsNoTracking()
                on expense.AccountId equals account.Id into accounts
            from account in accounts.DefaultIfEmpty()
            where expense.HouseholdId == householdId &&
                (expense.Scope == RecurringExpenseScope.Household ||
                 expense.OwnerUserId == userId)
            select new RecurringExpenseRecord(
                expense.Id,
                expense.Name,
                expense.Amount,
                expense.Currency,
                expense.Scope,
                expense.OwnerUserId,
                expense.CategoryId,
                category.Name,
                subcategory.Name,
                expense.AccountId,
                account == null ? null : account.Name,
                expense.ExpectedDayOfMonth,
                expense.StartsOn,
                expense.EndsOn,
                expense.IsActive))
            .ToListAsync(cancellationToken);
    }

    public Task<RecurringExpense?> GetForUpdateAsync(
        Guid householdId,
        Guid recurringExpenseId,
        CancellationToken cancellationToken) =>
        dbContext.RecurringExpenses.SingleOrDefaultAsync(
            expense => expense.HouseholdId == householdId && expense.Id == recurringExpenseId,
            cancellationToken);

    public Task<string?> GetHouseholdCurrencyAsync(
        Guid householdId,
        CancellationToken cancellationToken) =>
        dbContext.Households
            .Where(household => household.Id == householdId && household.IsActive)
            .Select(household => household.DefaultCurrency)
            .SingleOrDefaultAsync(cancellationToken);

    public async Task AddAsync(
        RecurringExpense recurringExpense,
        CancellationToken cancellationToken) =>
        await dbContext.RecurringExpenses.AddAsync(recurringExpense, cancellationToken);

    public Task SaveChangesAsync(CancellationToken cancellationToken) =>
        dbContext.SaveChangesAsync(cancellationToken);
}
