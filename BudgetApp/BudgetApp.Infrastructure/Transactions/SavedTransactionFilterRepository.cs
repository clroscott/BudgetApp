using BudgetApp.Application.Transactions;
using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.Transactions;
using BudgetApp.Infrastructure.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Infrastructure.Transactions;

public sealed class SavedTransactionFilterRepository(BudgetAppDbContext db) : ISavedTransactionFilterRepository
{
    public async Task<IReadOnlyList<SavedTransactionFilter>> ListAsync(Guid householdId, Guid userId, CancellationToken token) =>
        await db.SavedTransactionFilters.Where(filter => filter.HouseholdId == householdId && filter.UserId == userId)
            .OrderBy(filter => filter.Name).ToListAsync(token);
    public Task<SavedTransactionFilter?> FindAsync(Guid householdId, Guid userId, Guid id, CancellationToken token) =>
        db.SavedTransactionFilters.SingleOrDefaultAsync(filter => filter.HouseholdId == householdId &&
            filter.UserId == userId && filter.Id == id, token);
    public void Add(SavedTransactionFilter filter) => db.SavedTransactionFilters.Add(filter);
    public void Remove(SavedTransactionFilter filter) => db.SavedTransactionFilters.Remove(filter);
    public async Task SaveAsync(CancellationToken token)
    {
        try { await db.SaveChangesAsync(token); }
        catch (DbUpdateConcurrencyException) { throw new SavedFilterConflictException("Saved filter changed elsewhere. Reload saved filters."); }
        catch (DbUpdateException error) when (error.InnerException is SqlException { Number: 2601 or 2627 })
        { throw new SavedFilterConflictException("A saved filter with this name or identifier already exists. Reload saved filters."); }
    }

    public async Task<IReadOnlyList<string>> UnavailableReferencesAsync(Guid householdId, Guid userId,
        SavedTransactionFilterDefinition filters, CancellationToken token)
    {
        var issues = new List<string>();
        var account = SavedTransactionFilterDefinition.ParseId(filters.AccountId);
        if (account.HasValue && !await db.Accounts.AnyAsync(item => item.Id == account && item.HouseholdId == householdId &&
            (item.Scope == AccountScope.Household || item.OwnerUserId == userId), token))
            issues.Add("The selected account is unavailable. Choose another account or explicitly choose all visible accounts.");
        if (filters.CategoryId == SavedTransactionFilterDefinition.Uncategorized) return issues;
        var category = SavedTransactionFilterDefinition.ParseId(filters.CategoryId);
        var child = SavedTransactionFilterDefinition.ParseId(filters.SubcategoryId);
        if (category.HasValue)
        {
            var parent = await db.Categories.SingleOrDefaultAsync(item => item.Id == category && item.HouseholdId == householdId, token);
            if (parent is null || parent.ParentCategoryId is not null ||
                (!string.IsNullOrEmpty(filters.CategoryType) && parent.Type.ToString() != filters.CategoryType))
                issues.Add("The selected category is unavailable or no longer matches its type. Choose another category or explicitly choose all categories.");
            if (child.HasValue && !await db.Categories.AnyAsync(item => item.Id == child && item.HouseholdId == householdId &&
                item.ParentCategoryId == category, token))
                issues.Add("The selected subcategory is unavailable. Choose another subcategory or explicitly choose all subcategories.");
        }
        // IsActive is deliberately not checked: archived records can be searched historically.
        return issues;
    }
}
