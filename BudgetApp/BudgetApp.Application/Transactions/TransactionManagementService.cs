using System.Globalization;
using BudgetApp.Application.Auditing;
using BudgetApp.Application.Categories;
using BudgetApp.Application.Households;
using BudgetApp.Domain.Auditing;
using BudgetApp.Domain.Categories;
using BudgetApp.Domain.Households;

namespace BudgetApp.Application.Transactions;

public sealed class TransactionManagementService(
    ITransactionRepository transactionRepository,
    ICategoryRepository categoryRepository,
    HouseholdAuthorizationService authorizationService,
    TimeProvider timeProvider,
    AuditWriter? auditWriter = null)
{
    private const int PageSize = 100;

    public async Task<TransactionListResult> ListAsync(
        Guid householdId,
        Guid userId,
        Guid? accountId,
        DateOnly? fromDate,
        DateOnly? toDate,
        string? categoryType,
        Guid? categoryId,
        bool uncategorizedOnly,
        string? descriptionSearch,
        int page,
        CancellationToken cancellationToken,
        string? budgetInclusion = null, string? currency = null, bool spendingOnly = false)
    {
        if (page < 1)
        {
            throw new ArgumentOutOfRangeException(nameof(page), "Page must be at least 1.");
        }

        var criteria = TransactionSearchCriteria.Create(
            accountId,
            fromDate,
            toDate,
            categoryType,
            categoryId,
            uncategorizedOnly,
            descriptionSearch, budgetInclusion, currency, spendingOnly);

        var role = await authorizationService.RequireViewAsync(
            householdId,
            userId,
            cancellationToken);
        var result = await transactionRepository.ListVisibleAsync(
            householdId,
            userId,
            criteria.AccountId,
            criteria.FromDate,
            criteria.ToDate,
            criteria.CategoryType,
            criteria.CategoryId,
            criteria.UncategorizedOnly,
            criteria.DescriptionSearch,
            (page - 1) * PageSize,
            PageSize,
            cancellationToken, criteria.BudgetInclusion, criteria.Currency, criteria.SpendingOnly);
        var totalPages = result.TotalCount == 0
            ? 0
            : (int)Math.Ceiling(result.TotalCount / (double)PageSize);

        return new TransactionListResult(
            result.Items.Select(record => ToListItem(record, role, userId)).ToList(),
            page < totalPages,
            page,
            PageSize,
            result.TotalCount,
            totalPages);
    }

    public async Task UpdateAsync(
        Guid householdId,
        Guid userId,
        Guid transactionId,
        Guid? categoryId,
        DateOnly transactionDate,
        DateOnly? postedDate,
        decimal amount,
        string description,
        string? merchantName,
        string? notes,
        bool? isExcludedFromBudget,
        CancellationToken cancellationToken,
        DateTimeOffset? expectedUpdatedAtUtc = null)
    {
        var role = await authorizationService.RequireViewAsync(
            householdId,
            userId,
            cancellationToken);
        var access = await transactionRepository.GetForUpdateAsync(
            householdId,
            transactionId,
            cancellationToken) ?? throw new TransactionNotFoundException();

        RequireEditPermission(access, role, userId);
        var transaction = access.Transaction;
        if (expectedUpdatedAtUtc.HasValue && transaction.UpdatedAtUtc != expectedUpdatedAtUtc)
            throw new TransactionConflictException();
        if (transaction.IncludeInHouseholdBudget.HasValue &&
            isExcludedFromBudget.HasValue && isExcludedFromBudget != transaction.IsExcludedFromBudget)
            throw new InvalidOperationException("Use Include in budgets to change budget inclusion.");
        var previousCategoryId = transaction.CategoryId;
        var previousDate = transaction.TransactionDate;
        var previousAmount = transaction.Amount;
        var previousDescription = transaction.Description;
        var previousNotes = transaction.Notes;
        var previousBudgetTreatment = transaction.IsExcludedFromBudget;

        if (categoryId.HasValue)
        {
            var category = await categoryRepository.GetForUpdateAsync(
                householdId,
                categoryId.Value,
                cancellationToken) ?? throw new CategoryNotFoundException();
            if (!category.IsActive && transaction.CategoryId != category.Id)
            {
                throw new InvalidOperationException("A deactivated category cannot be assigned.");
            }
        }

        transaction.UpdateDetails(
            categoryId,
            transactionDate,
            postedDate,
            amount,
            description,
            merchantName,
            notes,
            isExcludedFromBudget ?? transaction.IsExcludedFromBudget,
            userId,
            timeProvider.GetUtcNow());

        var details = new Dictionary<string, string?>();
        AddChange(
            details,
            "Date",
            previousDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            transaction.TransactionDate.ToString(
                "yyyy-MM-dd",
                CultureInfo.InvariantCulture));
        AddChange(
            details,
            "Amount",
            previousAmount.ToString("0.####", CultureInfo.InvariantCulture),
            transaction.Amount.ToString("0.####", CultureInfo.InvariantCulture));
        AddChange(
            details,
            "Description",
            previousDescription,
            transaction.Description);
        AddChange(details, "Notes", previousNotes, transaction.Notes);
        AddChange(
            details,
            "Budget treatment",
            previousBudgetTreatment ? "Excluded" : "Included",
            transaction.IsExcludedFromBudget ? "Excluded" : "Included");
        if (previousCategoryId != transaction.CategoryId)
        {
            var categories = await categoryRepository.ListAsync(
                householdId,
                cancellationToken);
            details["Category"] =
                $"{CategoryName(categories, previousCategoryId)} → " +
                CategoryName(categories, transaction.CategoryId);
        }

        auditWriter?.Record(new AuditEventInput(
            householdId,
            userId,
            access.IsPersonalAccount
                ? AuditVisibility.Personal
                : AuditVisibility.Household,
            access.IsPersonalAccount ? access.AccountOwnerUserId : null,
            AuditActions.Updated,
            AuditEntityTypes.Transaction,
            transaction.Id,
            $"Updated transaction '{transaction.Description}'.",
            details));
        if (access.IsPersonalAccount && transaction.IncludeInHouseholdBudget == true &&
            !transaction.IsExcludedFromBudget)
            auditWriter?.Record(new AuditEventInput(
                householdId, userId, AuditVisibility.Household, null, AuditActions.Updated,
                AuditEntityTypes.Transaction, transaction.Id,
                "A shared personal-account transaction was updated.",
                new Dictionary<string, string?> {
                    ["Date"] = transaction.TransactionDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                    ["Amount"] = transaction.Amount.ToString("0.####", CultureInfo.InvariantCulture),
                    ["Description"] = transaction.Description
                }));
        await transactionRepository.SaveChangesAsync(cancellationToken);
    }

    public async Task UpdateBudgetInclusionAsync(
        Guid householdId, Guid userId, Guid transactionId, bool? includeHousehold,
        bool includePersonal, DateTimeOffset expectedUpdatedAtUtc, CancellationToken cancellationToken)
    {
        var role = await authorizationService.RequireViewAsync(householdId, userId, cancellationToken);
        var access = await transactionRepository.GetForUpdateAsync(householdId, transactionId, cancellationToken)
            ?? throw new TransactionNotFoundException();
        var transaction = access.Transaction;
        var ownsAccount = access.AccountOwnerUserId == userId;
        if (access.IsPersonalAccount && !ownsAccount &&
            (transaction.IncludeInHouseholdBudget != true || transaction.IsExcludedFromBudget))
            throw new TransactionNotFoundException();
        if (transaction.UpdatedAtUtc != expectedUpdatedAtUtc) throw new TransactionConflictException();
        transaction.InitializeBudgetInclusion(!access.IsPersonalAccount, access.AccountOwnerUserId);
        var previousHousehold = !transaction.IsExcludedFromBudget && transaction.IncludeInHouseholdBudget == true;
        if (includeHousehold.HasValue && includeHousehold.Value != previousHousehold &&
            (role == HouseholdRole.Viewer || access.IsPersonalAccount && !ownsAccount))
            throw new HouseholdAccessDeniedException();
        transaction.SetBudgetInclusionForUser(userId, includeHousehold ?? previousHousehold, includePersonal, timeProvider.GetUtcNow());
        auditWriter?.Record(new AuditEventInput(
            householdId, userId, AuditVisibility.Personal, userId, AuditActions.Updated,
            AuditEntityTypes.Transaction, transaction.Id, "Changed personal budget inclusion.",
            new Dictionary<string, string?> { ["Included in my personal budget"] = includePersonal ? "Yes" : "No" }));
        if (previousHousehold != transaction.IncludeInHouseholdBudget)
            auditWriter?.Record(new AuditEventInput(
                householdId, userId, AuditVisibility.Household, null, AuditActions.Updated,
                AuditEntityTypes.Transaction, transaction.Id,
                transaction.IncludeInHouseholdBudget == true
                    ? "An expense was included in the Household budget."
                    : "An expense was removed from the Household budget.",
                new Dictionary<string, string?> { ["Amount"] = transaction.Amount.ToString("0.####", CultureInfo.InvariantCulture) }));
        await transactionRepository.SaveChangesAsync(cancellationToken);
    }

    private static void AddChange(
        IDictionary<string, string?> details,
        string label,
        string? before,
        string? after)
    {
        if (!string.Equals(before, after, StringComparison.Ordinal))
        {
            details[label] = $"{before ?? "(none)"} → {after ?? "(none)"}";
        }
    }

    private static string CategoryName(
        IReadOnlyList<CategoryRecord> categories,
        Guid? categoryId) =>
        categoryId.HasValue
            ? categories.FirstOrDefault(category => category.Id == categoryId)?.Name
                ?? "Unavailable category"
            : "Uncategorized";

    private static void RequireEditPermission(
        TransactionAccessRecord access,
        HouseholdRole role,
        Guid userId)
    {
        if (access.IsPersonalAccount)
        {
            if (access.AccountOwnerUserId != userId)
            {
                throw new TransactionNotFoundException();
            }

            return;
        }

        if (role == HouseholdRole.Viewer)
        {
            throw new HouseholdAccessDeniedException();
        }
    }

    private static TransactionListItem ToListItem(
        TransactionRecord record,
        HouseholdRole role,
        Guid userId) =>
        new(
            record.Id,
            record.AccountId,
            record.AccountName,
            record.Currency,
            record.CategoryId,
            record.CategoryName,
            record.TransactionDate,
            record.PostedDate,
            record.Amount,
            record.Description,
            record.MerchantName,
            record.Notes,
            record.Source,
            record.ReviewStatus,
            record.IsExcludedFromBudget,
            record.IsVoided,
            record.IsPersonalAccount
                ? record.AccountOwnerUserId == userId
                : role != HouseholdRole.Viewer,
            record.IncludeInHouseholdBudget,
            record.IncludeInPersonalBudget,
            role != HouseholdRole.Viewer && (!record.IsPersonalAccount || record.AccountOwnerUserId == userId),
            record.UpdatedAtUtc);
}
