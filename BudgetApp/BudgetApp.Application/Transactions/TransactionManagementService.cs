using BudgetApp.Application.Categories;
using BudgetApp.Application.Households;
using BudgetApp.Domain.Categories;
using BudgetApp.Domain.Households;

namespace BudgetApp.Application.Transactions;

public sealed class TransactionManagementService(
    ITransactionRepository transactionRepository,
    ICategoryRepository categoryRepository,
    HouseholdAuthorizationService authorizationService,
    TimeProvider timeProvider)
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
        CancellationToken cancellationToken)
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
            descriptionSearch);

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
            cancellationToken);
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
        bool isExcludedFromBudget,
        CancellationToken cancellationToken)
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

        if (categoryId.HasValue)
        {
            var category = await categoryRepository.GetForUpdateAsync(
                householdId,
                categoryId.Value,
                cancellationToken) ?? throw new CategoryNotFoundException();
            if (!category.IsActive && access.Transaction.CategoryId != category.Id)
            {
                throw new InvalidOperationException("A deactivated category cannot be assigned.");
            }
        }

        access.Transaction.UpdateDetails(
            categoryId,
            transactionDate,
            postedDate,
            amount,
            description,
            merchantName,
            notes,
            isExcludedFromBudget,
            userId,
            timeProvider.GetUtcNow());
        await transactionRepository.SaveChangesAsync(cancellationToken);
    }

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
                : role != HouseholdRole.Viewer);
}
