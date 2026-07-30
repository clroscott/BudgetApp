using BudgetApp.Application.Budgets;
using BudgetApp.Domain.Budgeting;
using BudgetApp.Domain.Households;
using BudgetApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Infrastructure.Budgets;

public sealed class YearlyPlanRepository(BudgetAppDbContext dbContext) :
    IYearlyPlanRepository
{
    public Task<YearlyPlan?> GetAsync(
        Guid householdId,
        int fiscalYearStartYear,
        BudgetScope scope,
        Guid? ownerUserId,
        bool forUpdate,
        CancellationToken cancellationToken)
    {
        IQueryable<YearlyPlan> query = dbContext.YearlyPlans
            .Include(plan => plan.Lines);
        if (!forUpdate) query = query.AsNoTracking();
        return query.SingleOrDefaultAsync(plan =>
            plan.HouseholdId == householdId &&
            plan.FiscalYearStartYear == fiscalYearStartYear &&
            plan.Scope == scope &&
            plan.OwnerUserId == ownerUserId,
            cancellationToken);
    }

    public async Task<IReadOnlyList<YearlyPlan>> ListCalendarYearCandidatesAsync(
        Guid householdId,
        int calendarYear,
        BudgetScope scope,
        Guid? ownerUserId,
        CancellationToken cancellationToken) =>
        await dbContext.YearlyPlans
            .AsNoTracking()
            .Include(plan => plan.Lines)
            .Where(plan =>
                plan.HouseholdId == householdId &&
                (plan.FiscalYearStartYear == calendarYear ||
                 plan.FiscalYearStartYear == calendarYear - 1) &&
                plan.Scope == scope &&
                plan.OwnerUserId == ownerUserId)
            .ToListAsync(cancellationToken);

    public Task<YearlyPlanDefaults?> GetDefaultsAsync(
        Guid householdId,
        CancellationToken cancellationToken) =>
        dbContext.Households
            .AsNoTracking()
            .Where(household => household.Id == householdId && household.IsActive)
            .Select(household => new YearlyPlanDefaults(
                household.DefaultCurrency,
                household.FiscalYearStartMonth))
            .SingleOrDefaultAsync(cancellationToken);

    public Task<Household?> GetHouseholdForUpdateAsync(
        Guid householdId,
        CancellationToken cancellationToken) =>
        dbContext.Households.SingleOrDefaultAsync(
            household => household.Id == householdId && household.IsActive,
            cancellationToken);

    public async Task AddAsync(YearlyPlan plan, CancellationToken cancellationToken) =>
        await dbContext.YearlyPlans.AddAsync(plan, cancellationToken);

    public Task SaveChangesAsync(CancellationToken cancellationToken) =>
        dbContext.SaveChangesAsync(cancellationToken);
}
