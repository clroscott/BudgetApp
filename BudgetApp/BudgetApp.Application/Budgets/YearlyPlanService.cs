using BudgetApp.Application.Auditing;
using BudgetApp.Application.Households;
using BudgetApp.Domain.Auditing;
using BudgetApp.Domain.Budgeting;

namespace BudgetApp.Application.Budgets;

public sealed class YearlyPlanService(
    IYearlyPlanRepository yearlyPlanRepository,
    IBudgetRepository budgetRepository,
    HouseholdAuthorizationService authorizationService,
    TimeProvider timeProvider,
    AuditWriter? auditWriter = null)
{
    public async Task<YearlyPlanPageModel> GetAsync(
        Guid householdId,
        Guid userId,
        int fiscalYearStartYear,
        string scope,
        CancellationToken cancellationToken)
    {
        await authorizationService.RequireViewAsync(householdId, userId, cancellationToken);
        var parsedScope = ParseScope(scope);
        ValidateStartYear(fiscalYearStartYear);
        var ownerUserId = parsedScope == BudgetScope.Personal ? userId : (Guid?)null;
        var defaults = await GetDefaults(householdId, cancellationToken);
        var plan = await yearlyPlanRepository.GetAsync(
            householdId,
            fiscalYearStartYear,
            parsedScope,
            ownerUserId,
            forUpdate: false,
            cancellationToken);
        var categories = await budgetRepository.ListExpenseCategoriesAsync(
            householdId,
            cancellationToken);
        return BuildModel(
            plan,
            fiscalYearStartYear,
            parsedScope,
            defaults,
            categories);
    }

    public async Task<YearlyPlanPageModel> SaveAsync(
        Guid householdId,
        Guid userId,
        int fiscalYearStartYear,
        string scope,
        int? requestedFiscalYearStartMonth,
        IReadOnlyList<YearlyTargetLineInput> lines,
        CancellationToken cancellationToken)
    {
        await authorizationService.RequireEditAsync(householdId, userId, cancellationToken);
        var parsedScope = ParseScope(scope);
        ValidateStartYear(fiscalYearStartYear);
        var ownerUserId = parsedScope == BudgetScope.Personal ? userId : (Guid?)null;
        var defaults = await GetDefaults(householdId, cancellationToken);
        var categories = await budgetRepository.ListExpenseCategoriesAsync(
            householdId,
            cancellationToken);
        ValidateLines(lines, categories);

        var plan = await yearlyPlanRepository.GetAsync(
            householdId,
            fiscalYearStartYear,
            parsedScope,
            ownerUserId,
            forUpdate: true,
            cancellationToken);
        var fiscalYearStartMonth =
            requestedFiscalYearStartMonth ??
            plan?.FiscalYearStartMonth ??
            defaults.FiscalYearStartMonth;
        ValidateFiscalPeriod(fiscalYearStartYear, fiscalYearStartMonth);
        var now = timeProvider.GetUtcNow();
        var created = plan is null;
        var previousFiscalYearStartMonth = plan?.FiscalYearStartMonth;
        if (plan is null)
        {
            plan = parsedScope == BudgetScope.Household
                ? YearlyPlan.CreateHousehold(
                    householdId,
                    fiscalYearStartYear,
                    fiscalYearStartMonth,
                    defaults.Currency,
                    now)
                : YearlyPlan.CreatePersonal(
                    householdId,
                    userId,
                    fiscalYearStartYear,
                    fiscalYearStartMonth,
                    defaults.Currency,
                    now);
            foreach (var line in lines)
                plan.AddLine(line.CategoryId, line.AnnualTargetAmount, now);
            await yearlyPlanRepository.AddAsync(plan, cancellationToken);
        }
        else
        {
            plan.ChangeFiscalYearStartMonth(fiscalYearStartMonth, now);
            plan.ReplaceLines(
                lines.Select(line => (line.CategoryId, line.AnnualTargetAmount)).ToList(),
                now);
        }

        Record(
            plan,
            userId,
            created ? AuditActions.Created : AuditActions.Updated,
            $"{(created ? "Created" : "Updated")} FY {fiscalYearStartYear} " +
            $"{parsedScope.ToString().ToLowerInvariant()} annual targets.",
            new Dictionary<string, string?>
            {
                ["Fiscal year starts"] =
                    $"{fiscalYearStartYear:D4}-{plan.FiscalYearStartMonth:D2}",
                ["Previous fiscal start month"] =
                    previousFiscalYearStartMonth?.ToString(),
                ["Target lines"] = plan.Lines.Count.ToString()
            });
        await yearlyPlanRepository.SaveChangesAsync(cancellationToken);
        return BuildModel(plan, fiscalYearStartYear, parsedScope, defaults, categories);
    }

    public async Task<int> ChangeDefaultStartMonthAsync(
        Guid householdId,
        Guid userId,
        int startMonth,
        CancellationToken cancellationToken)
    {
        await authorizationService.RequireEditAsync(householdId, userId, cancellationToken);
        var household = await yearlyPlanRepository.GetHouseholdForUpdateAsync(
            householdId,
            cancellationToken) ?? throw new HouseholdAccessDeniedException();
        var previous = household.FiscalYearStartMonth;
        household.ChangeFiscalYearStartMonth(startMonth, timeProvider.GetUtcNow());
        auditWriter?.Record(new AuditEventInput(
            householdId,
            userId,
            AuditVisibility.Household,
            null,
            AuditActions.Updated,
            AuditEntityTypes.Household,
            householdId,
            "Changed the default fiscal year start month.",
            new Dictionary<string, string?>
            {
                ["Fiscal year start month"] = $"{previous} → {startMonth}"
            }));
        await yearlyPlanRepository.SaveChangesAsync(cancellationToken);
        return household.FiscalYearStartMonth;
    }

    public async Task<YearlyAllocationResult> AllocateAsync(
        Guid householdId,
        Guid userId,
        int fiscalYearStartYear,
        string scope,
        IReadOnlyList<YearlyAllocationPeriodInput> selectedPeriods,
        bool replaceExistingDrafts,
        CancellationToken cancellationToken)
    {
        await authorizationService.RequireEditAsync(householdId, userId, cancellationToken);
        var parsedScope = ParseScope(scope);
        var ownerUserId = parsedScope == BudgetScope.Personal ? userId : (Guid?)null;
        var plan = await yearlyPlanRepository.GetAsync(
            householdId,
            fiscalYearStartYear,
            parsedScope,
            ownerUserId,
            forUpdate: false,
            cancellationToken)
            ?? throw new InvalidOperationException(
                "Save annual targets before creating monthly budgets.");
        if (plan.Lines.Count == 0)
            throw new InvalidOperationException(
                "Add at least one annual target before creating monthly budgets.");

        if (selectedPeriods is null || selectedPeriods.Count == 0)
            throw new ArgumentException("Select at least one fiscal month.");
        if (selectedPeriods
            .Select(period => (period.Year, period.Month))
            .Distinct()
            .Count() != selectedPeriods.Count)
            throw new ArgumentException("Each fiscal month can be selected only once.");

        var selectedPeriodKeys = selectedPeriods
            .Select(period => (period.Year, period.Month))
            .ToHashSet();
        var periods = GetFiscalPeriods(
                plan.FiscalYearStartYear,
                plan.FiscalYearStartMonth)
            .Where(period => selectedPeriodKeys.Contains((period.Year, period.Month)))
            .ToList();
        if (periods.Count != selectedPeriods.Count)
            throw new ArgumentException(
                "Every selected month must be inside this fiscal year.");

        var results = new List<YearlyAllocationMonthResult>();
        foreach (var period in periods)
        {
            var existing = await budgetRepository.GetAsync(
                householdId,
                period.Year,
                period.Month,
                parsedScope,
                ownerUserId,
                forUpdate: true,
                cancellationToken);
            if (existing is not null &&
                (!replaceExistingDrafts || existing.Status != BudgetStatus.Draft))
            {
                results.Add(new YearlyAllocationMonthResult(
                    period.Year,
                    period.Month,
                    existing.Status == BudgetStatus.Draft
                        ? "SkippedExistingDraft"
                        : $"Skipped{existing.Status}",
                    existing.Id));
                continue;
            }

            var amounts = plan.Lines.ToDictionary(
                line => line.CategoryId,
                line => AllocateMonthlyAmount(
                    line.AnnualTargetAmount,
                    period.Ordinal));
            if (existing is null)
            {
                var now = timeProvider.GetUtcNow();
                existing = parsedScope == BudgetScope.Household
                    ? BudgetMonth.CreateHousehold(
                        householdId, period.Year, period.Month, plan.Currency, now)
                    : BudgetMonth.CreatePersonal(
                        householdId, userId, period.Year, period.Month, plan.Currency, now);
                foreach (var amount in amounts)
                    existing.AddLine(amount.Key, amount.Value, now);
                await budgetRepository.AddAsync(existing, cancellationToken);
                results.Add(new YearlyAllocationMonthResult(
                    period.Year, period.Month, "Created", existing.Id));
            }
            else
            {
                var now = timeProvider.GetUtcNow();
                foreach (var line in existing.Lines.ToList())
                    existing.RemoveLine(line.CategoryId, now);
                foreach (var amount in amounts)
                {
                    var line = existing.AddLine(amount.Key, amount.Value, now);
                    await budgetRepository.AddLineAsync(line, cancellationToken);
                }
                results.Add(new YearlyAllocationMonthResult(
                    period.Year, period.Month, "ReplacedDraft", existing.Id));
            }
        }

        Record(
            plan,
            userId,
            AuditActions.Copied,
            $"Allocated FY {fiscalYearStartYear} annual targets into monthly drafts.",
            new Dictionary<string, string?>
            {
                ["Created months"] =
                    results.Count(result => result.Result == "Created").ToString(),
                ["Replaced drafts"] =
                    results.Count(result => result.Result == "ReplacedDraft").ToString(),
                ["Skipped months"] =
                    results.Count(result => result.Result.StartsWith("Skipped")).ToString(),
                ["Selected months"] = selectedPeriods.Count.ToString()
            });
        await budgetRepository.SaveChangesAsync(cancellationToken);
        return new YearlyAllocationResult(
            results.Count(result => result.Result == "Created"),
            results.Count(result => result.Result == "ReplacedDraft"),
            results.Count(result => result.Result.StartsWith("Skipped")),
            results);
    }

    private static YearlyPlanPageModel BuildModel(
        YearlyPlan? plan,
        int startYear,
        BudgetScope scope,
        YearlyPlanDefaults defaults,
        IReadOnlyList<BudgetCategoryRecord> categories)
    {
        var startMonth = plan?.FiscalYearStartMonth ?? defaults.FiscalYearStartMonth;
        ValidateFiscalPeriod(startYear, startMonth);
        var startsOn = new DateOnly(startYear, startMonth, 1);
        var endsOn = startsOn.AddYears(1).AddDays(-1);
        var amounts = plan?.Lines.ToDictionary(
            line => line.CategoryId,
            line => line.AnnualTargetAmount) ?? [];
        var roots = categories
            .Where(category => !category.ParentCategoryId.HasValue)
            .OrderBy(category => category.DisplayOrder)
            .ThenBy(category => category.Name)
            .Select(root => ToCategory(
                root,
                categories
                    .Where(category => category.ParentCategoryId == root.Id)
                    .OrderBy(category => category.DisplayOrder)
                    .ThenBy(category => category.Name)
                    .ToList(),
                amounts))
            .ToList();
        return new YearlyPlanPageModel(
            plan?.Id,
            startYear,
            startMonth,
            defaults.FiscalYearStartMonth,
            scope.ToString(),
            plan?.Currency ?? defaults.Currency,
            startsOn,
            endsOn,
            plan?.UpdatedAtUtc,
            roots);
    }

    private static YearlyTargetCategoryModel ToCategory(
        BudgetCategoryRecord category,
        IReadOnlyList<BudgetCategoryRecord> children,
        IReadOnlyDictionary<Guid, decimal> amounts)
    {
        decimal? amount = amounts.TryGetValue(category.Id, out var value) ? value : null;
        return new YearlyTargetCategoryModel(
            category.Id,
            category.Name,
            category.IsActive,
            amount,
            amount.HasValue ? decimal.Round(amount.Value / 12m, 2) : null,
            children.Select(child => ToCategory(child, [], amounts)).ToList());
    }

    private static void ValidateLines(
        IReadOnlyList<YearlyTargetLineInput> lines,
        IReadOnlyList<BudgetCategoryRecord> categories)
    {
        if (lines.Select(line => line.CategoryId).Distinct().Count() != lines.Count)
            throw new ArgumentException("Each category can appear only once.", nameof(lines));
        var byId = categories.ToDictionary(category => category.Id);
        foreach (var line in lines)
        {
            if (!byId.TryGetValue(line.CategoryId, out var category) || !category.IsActive)
                throw new ArgumentException(
                    "Every annual target must use an active household expense category.",
                    nameof(lines));
            if (line.AnnualTargetAmount < 0)
                throw new ArgumentException(
                    "Annual target amounts must be zero or greater.",
                    nameof(lines));
        }

        foreach (var root in categories.Where(category => !category.ParentCategoryId.HasValue))
        {
            if (lines.Any(line => line.CategoryId == root.Id) &&
                lines.Any(line => byId[line.CategoryId].ParentCategoryId == root.Id))
                throw new ArgumentException(
                    $"{root.Name} cannot use both an overall target and subcategory targets.",
                    nameof(lines));
        }
    }

    private static List<(int Year, int Month, int Ordinal)> GetFiscalPeriods(
        int startYear,
        int startMonth)
    {
        ValidateFiscalPeriod(startYear, startMonth);
        var first = new DateOnly(startYear, startMonth, 1);
        return Enumerable.Range(0, 12)
            .Select(index =>
            {
                var date = first.AddMonths(index);
                return (date.Year, date.Month, index);
            })
            .ToList();
    }

    private static decimal AllocateMonthlyAmount(decimal annualAmount, int ordinal)
    {
        var totalCents = decimal.ToInt64(decimal.Round(
            annualAmount * 100m,
            0,
            MidpointRounding.AwayFromZero));
        var baseCents = totalCents / 12;
        var remainder = totalCents % 12;
        return (baseCents + (ordinal < remainder ? 1 : 0)) / 100m;
    }

    private async Task<YearlyPlanDefaults> GetDefaults(
        Guid householdId,
        CancellationToken cancellationToken) =>
        await yearlyPlanRepository.GetDefaultsAsync(householdId, cancellationToken)
        ?? throw new HouseholdAccessDeniedException();

    private static BudgetScope ParseScope(string scope) =>
        Enum.TryParse<BudgetScope>(scope, true, out var parsed) && Enum.IsDefined(parsed)
            ? parsed
            : throw new ArgumentException("Budget scope must be Household or Personal.");

    private static void ValidateStartYear(int year)
    {
        if (year is < BudgetMonth.MinimumYear or > BudgetMonth.MaximumYear)
            throw new ArgumentOutOfRangeException(nameof(year));
    }

    private static void ValidateFiscalPeriod(int startYear, int startMonth)
    {
        ValidateStartYear(startYear);
        if (startMonth is < 1 or > 12)
            throw new ArgumentOutOfRangeException(nameof(startMonth));
        if (startYear == BudgetMonth.MaximumYear)
            throw new ArgumentOutOfRangeException(
                nameof(startYear),
                "This fiscal year would exceed the supported calendar range.");
    }

    private void Record(
        YearlyPlan plan,
        Guid userId,
        string action,
        string summary,
        IReadOnlyDictionary<string, string?> details) =>
        auditWriter?.Record(new AuditEventInput(
            plan.HouseholdId,
            userId,
            plan.Scope == BudgetScope.Household
                ? AuditVisibility.Household
                : AuditVisibility.Personal,
            plan.OwnerUserId,
            action,
            AuditEntityTypes.YearlyPlan,
            plan.Id,
            summary,
            details));
}
