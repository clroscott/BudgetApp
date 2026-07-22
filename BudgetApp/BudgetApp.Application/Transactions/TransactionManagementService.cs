using BudgetApp.Application.Categories;
using BudgetApp.Application.Households;
using BudgetApp.Domain.Households;

namespace BudgetApp.Application.Transactions;

public sealed class TransactionManagementService(
    ITransactionRepository transactionRepository,
    ICategoryRepository categoryRepository,
    HouseholdAuthorizationService authorizationService,
    TimeProvider timeProvider)
{
    private const int PageSize = 200;

    public async Task<TransactionListResult> ListAsync(
        Guid householdId,
        Guid userId,
        Guid? accountId,
        DateOnly? fromDate,
        DateOnly? toDate,
        CancellationToken cancellationToken)
    {
        if (fromDate > toDate)
        {
            throw new ArgumentException("From date cannot be after to date.");
        }

        var role = await authorizationService.RequireViewAsync(
            householdId,
            userId,
            cancellationToken);
        var records = await transactionRepository.ListVisibleAsync(
            householdId,
            userId,
            accountId,
            fromDate,
            toDate,
            PageSize + 1,
            cancellationToken);

        return new TransactionListResult(
            records.Take(PageSize).Select(record => ToListItem(record, role, userId)).ToList(),
            records.Count > PageSize);
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
