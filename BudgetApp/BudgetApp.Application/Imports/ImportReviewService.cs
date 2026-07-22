using System.Text.Json;
using BudgetApp.Application.Categories;
using BudgetApp.Application.Households;
using BudgetApp.Domain.Households;
using BudgetApp.Domain.Imports;
using BudgetApp.Domain.Transactions;

namespace BudgetApp.Application.Imports;

public sealed class ImportReviewService(
    IImportRepository importRepository,
    ICategoryRepository categoryRepository,
    HouseholdAuthorizationService authorizationService,
    TimeProvider timeProvider)
{
    public async Task<IReadOnlyList<ImportListItem>> ListAsync(
        Guid householdId,
        Guid userId,
        CancellationToken cancellationToken)
    {
        var role = await authorizationService.RequireViewAsync(
            householdId, userId, cancellationToken);
        return (await importRepository.ListVisibleAsync(
                householdId, userId, cancellationToken))
            .OrderByDescending(record => record.UploadedAtUtc)
            .Take(50)
            .Select(record => new ImportListItem(
                record.Id,
                record.OriginalFileName,
                record.AccountName,
                record.Status,
                record.TotalRows,
                record.ValidRows,
                record.InvalidRows,
                record.ApprovedRows,
                record.RejectedRows,
                record.SkippedRows,
                record.DuplicateRows,
                record.UploadedAtUtc,
                CanEdit(record.IsPersonalAccount, record.AccountOwnerUserId, role, userId)))
            .ToList();
    }

    public async Task<ImportReviewDetail> GetAsync(
        Guid householdId,
        Guid userId,
        Guid importFileId,
        CancellationToken cancellationToken)
    {
        var (access, role) = await GetAuthorized(
            householdId, userId, importFileId, forUpdate: false, cancellationToken);
        var drafts = await importRepository.ListDraftsAsync(
            importFileId, forUpdate: false, cancellationToken);
        return ToDetail(access, drafts, role, userId);
    }

    public async Task CheckDuplicatesAsync(
        Guid householdId,
        Guid userId,
        Guid importFileId,
        CancellationToken cancellationToken)
    {
        var (access, role) = await GetAuthorized(
            householdId, userId, importFileId, forUpdate: true, cancellationToken);
        RequireEdit(access, role, userId);
        RequireReviewable(access.ImportFile);
        var drafts = await importRepository.ListDraftsAsync(
            importFileId, forUpdate: true, cancellationToken);
        await ApplyDuplicateResults(access.ImportFile.AccountId, drafts, cancellationToken);
        access.ImportFile.RefreshStatistics(CalculateStatistics(drafts), timeProvider.GetUtcNow());
        await importRepository.SaveChangesAsync(cancellationToken);
    }

    public async Task UpdateDraftAsync(
        Guid householdId,
        Guid userId,
        Guid importFileId,
        Guid draftId,
        DateOnly? transactionDate,
        decimal? amount,
        string? description,
        Guid? selectedCategoryId,
        CancellationToken cancellationToken)
    {
        var (access, role) = await GetAuthorized(
            householdId, userId, importFileId, forUpdate: true, cancellationToken);
        RequireEdit(access, role, userId);
        RequireReviewable(access.ImportFile);
        var drafts = await importRepository.ListDraftsAsync(
            importFileId, forUpdate: true, cancellationToken);
        var draft = drafts.SingleOrDefault(candidate => candidate.Id == draftId)
            ?? throw new ImportDraftNotFoundException();

        if (selectedCategoryId.HasValue)
        {
            var category = await categoryRepository.GetForUpdateAsync(
                householdId, selectedCategoryId.Value, cancellationToken)
                ?? throw new CategoryNotFoundException();
            if (!category.IsActive && draft.SelectedCategoryId != category.Id)
            {
                throw new InvalidOperationException("A deactivated category cannot be assigned.");
            }
        }

        var now = timeProvider.GetUtcNow();
        draft.CorrectParsedValues(
            transactionDate, amount, description, selectedCategoryId, now);
        await ApplyDuplicateResults(access.ImportFile.AccountId, [draft], cancellationToken);
        access.ImportFile.RefreshStatistics(CalculateStatistics(drafts), now);
        await importRepository.SaveChangesAsync(cancellationToken);
    }

    public async Task SetDecisionAsync(
        Guid householdId,
        Guid userId,
        Guid importFileId,
        Guid draftId,
        string decision,
        bool acknowledgePossibleDuplicate,
        CancellationToken cancellationToken)
    {
        var (access, role) = await GetAuthorized(
            householdId, userId, importFileId, forUpdate: true, cancellationToken);
        RequireEdit(access, role, userId);
        RequireReviewable(access.ImportFile);
        var drafts = await importRepository.ListDraftsAsync(
            importFileId, forUpdate: true, cancellationToken);
        var draft = drafts.SingleOrDefault(candidate => candidate.Id == draftId)
            ?? throw new ImportDraftNotFoundException();
        var now = timeProvider.GetUtcNow();

        switch (decision.Trim().ToLowerInvariant())
        {
            case "approved":
                draft.Approve(userId, acknowledgePossibleDuplicate, now);
                break;
            case "rejected":
                draft.Reject(userId, now);
                break;
            case "skipped":
                draft.Skip(userId, now);
                break;
            default:
                throw new ArgumentException("Review decision is not supported.", nameof(decision));
        }

        access.ImportFile.RefreshStatistics(CalculateStatistics(drafts), now);
        await importRepository.SaveChangesAsync(cancellationToken);
    }

    public async Task<CompleteImportResult> CompleteAsync(
        Guid householdId,
        Guid userId,
        Guid importFileId,
        CancellationToken cancellationToken)
    {
        var (access, role) = await GetAuthorized(
            householdId, userId, importFileId, forUpdate: true, cancellationToken);
        RequireEdit(access, role, userId);
        var importFile = access.ImportFile;
        var drafts = await importRepository.ListDraftsAsync(
            importFileId, forUpdate: true, cancellationToken);

        if (importFile.Status == ImportFileStatus.Completed)
        {
            return new CompleteImportResult(
                importFile.Id, 0, importFile.ApprovedRowCount,
                importFile.RejectedRowCount, importFile.SkippedRowCount,
                importFile.Status.ToString());
        }

        RequireReviewable(importFile);
        var statistics = CalculateStatistics(drafts);
        if (statistics.PendingRows != 0)
        {
            throw new InvalidOperationException(
                "Every row must be approved, rejected, or skipped before completing the import.");
        }

        var now = timeProvider.GetUtcNow();
        var transactions = drafts
            .Where(draft =>
                draft.ReviewDecision == ImportDraftReviewDecision.Approved &&
                !draft.ApprovedTransactionId.HasValue)
            .Select(draft => Transaction.CreateImported(
                importFile.HouseholdId,
                importFile.AccountId,
                draft.SelectedCategoryId,
                importFile.Id,
                draft.SourceRowNumber,
                draft.TransactionDate!.Value,
                postedDate: null,
                draft.Amount!.Value,
                draft.Description!,
                draft.OriginalDescription,
                merchantName: null,
                notes: null,
                isExcludedFromBudget: false,
                userId,
                now))
            .ToList();

        foreach (var transaction in transactions)
        {
            var draft = drafts.Single(candidate =>
                candidate.SourceRowNumber == transaction.ImportRowNumber);
            draft.LinkApprovedTransaction(transaction, now);
        }

        await importRepository.AddTransactionsAsync(transactions, cancellationToken);
        importFile.Complete(statistics, now);
        await importRepository.SaveChangesAsync(cancellationToken);
        return new CompleteImportResult(
            importFile.Id, transactions.Count, importFile.ApprovedRowCount,
            importFile.RejectedRowCount, importFile.SkippedRowCount,
            importFile.Status.ToString());
    }

    public async Task DiscardAsync(
        Guid householdId,
        Guid userId,
        Guid importFileId,
        CancellationToken cancellationToken)
    {
        var (access, role) = await GetAuthorized(
            householdId, userId, importFileId, forUpdate: true, cancellationToken);
        RequireEdit(access, role, userId);
        if (access.ImportFile.Status == ImportFileStatus.Completed)
        {
            throw new InvalidOperationException(
                "A completed import cannot be discarded because its official transactions retain import history.");
        }

        importRepository.Remove(access.ImportFile);
        await importRepository.SaveChangesAsync(cancellationToken);
    }

    public async Task ApplyDuplicateResults(
        Guid accountId,
        IReadOnlyCollection<ImportTransactionDraft> drafts,
        CancellationToken cancellationToken)
    {
        var dated = drafts.Where(draft => draft.TransactionDate.HasValue).ToList();
        if (dated.Count == 0)
        {
            foreach (var draft in drafts)
            {
                draft.SetDuplicateResult(ImportDraftDuplicateStatus.NoMatch, null, timeProvider.GetUtcNow());
            }
            return;
        }

        var candidates = await importRepository.ListDuplicateCandidatesAsync(
            accountId,
            dated.Min(draft => draft.TransactionDate!.Value),
            dated.Max(draft => draft.TransactionDate!.Value),
            cancellationToken);
        var now = timeProvider.GetUtcNow();
        foreach (var draft in drafts)
        {
            var match = candidates.FirstOrDefault(candidate =>
                draft.TransactionDate == candidate.TransactionDate &&
                draft.Amount == candidate.Amount &&
                string.Equals(
                    draft.Description?.Trim(),
                    candidate.Description.Trim(),
                    StringComparison.OrdinalIgnoreCase));
            draft.SetDuplicateResult(
                match is null
                    ? ImportDraftDuplicateStatus.NoMatch
                    : ImportDraftDuplicateStatus.PossibleDuplicate,
                match?.TransactionId,
                now);
        }
    }

    private async Task<(ImportAccessRecord Access, HouseholdRole Role)> GetAuthorized(
        Guid householdId,
        Guid userId,
        Guid importFileId,
        bool forUpdate,
        CancellationToken cancellationToken)
    {
        var role = await authorizationService.RequireViewAsync(
            householdId, userId, cancellationToken);
        var access = await importRepository.GetAccessAsync(
            householdId, importFileId, forUpdate, cancellationToken)
            ?? throw new ImportNotFoundException();
        if (access.IsPersonalAccount && access.AccountOwnerUserId != userId)
        {
            throw new ImportNotFoundException();
        }
        return (access, role);
    }

    private static void RequireEdit(
        ImportAccessRecord access,
        HouseholdRole role,
        Guid userId)
    {
        if (access.IsPersonalAccount)
        {
            if (access.AccountOwnerUserId != userId) throw new ImportNotFoundException();
        }
        else if (role == HouseholdRole.Viewer)
        {
            throw new HouseholdAccessDeniedException();
        }
    }

    private static bool CanEdit(
        bool isPersonal,
        Guid? ownerUserId,
        HouseholdRole role,
        Guid userId) =>
        isPersonal ? ownerUserId == userId : role != HouseholdRole.Viewer;

    private static void RequireReviewable(ImportFile importFile)
    {
        if (importFile.Status != ImportFileStatus.ReadyForReview)
        {
            throw new InvalidOperationException("Only an import ready for review can be changed.");
        }
    }

    private static ImportStatistics CalculateStatistics(
        IReadOnlyCollection<ImportTransactionDraft> drafts) =>
        new(
            drafts.Count,
            drafts.Count(draft => draft.ValidationStatus == ImportDraftValidationStatus.Valid),
            drafts.Count(draft => draft.ValidationStatus == ImportDraftValidationStatus.Invalid),
            drafts.Count(draft => draft.ReviewDecision == ImportDraftReviewDecision.Approved),
            drafts.Count(draft => draft.ReviewDecision == ImportDraftReviewDecision.Rejected),
            drafts.Count(draft => draft.ReviewDecision == ImportDraftReviewDecision.Skipped),
            drafts.Count(draft => draft.DuplicateStatus == ImportDraftDuplicateStatus.PossibleDuplicate));

    private static ImportReviewDetail ToDetail(
        ImportAccessRecord access,
        IReadOnlyList<ImportTransactionDraft> drafts,
        HouseholdRole role,
        Guid userId)
    {
        var file = access.ImportFile;
        return new ImportReviewDetail(
            file.Id, file.OriginalFileName, access.AccountName, access.Currency,
            file.Status.ToString(), file.TotalRowCount, file.ValidRowCount,
            file.InvalidRowCount, file.ApprovedRowCount, file.RejectedRowCount,
            file.SkippedRowCount, file.DuplicateRowCount,
            CanEdit(access.IsPersonalAccount, access.AccountOwnerUserId, role, userId),
            drafts.Select(ToDraftItem).ToList());
    }

    private static ImportDraftItem ToDraftItem(ImportTransactionDraft draft)
    {
        var (categoryName, subcategoryName) = ReadImportedCategoryNames(draft.RawData);
        return new ImportDraftItem(
            draft.Id, draft.SourceRowNumber, draft.TransactionDate, draft.Amount,
            draft.Description, categoryName, subcategoryName, draft.SelectedCategoryId,
            draft.ValidationStatus.ToString(), draft.ValidationMessage,
            draft.DuplicateStatus.ToString(), draft.PossibleMatchingTransactionId,
            draft.ReviewDecision.ToString(), draft.IsDuplicateAcknowledged,
            draft.ApprovedTransactionId);
    }

    private static (string? CategoryName, string? SubcategoryName)
        ReadImportedCategoryNames(string rawData)
    {
        try
        {
            using var document = JsonDocument.Parse(rawData);
            string? categoryName = null;
            string? subcategoryName = null;
            foreach (var property in document.RootElement.EnumerateObject())
            {
                if (property.Value.ValueKind != JsonValueKind.String)
                {
                    continue;
                }

                var normalizedName = new string(property.Name
                    .Where(char.IsLetterOrDigit)
                    .Select(char.ToLowerInvariant)
                    .ToArray());
                if (normalizedName == "category")
                {
                    categoryName = NormalizeImportedValue(property.Value.GetString());
                }
                else if (normalizedName is "subcategory" or "subcat")
                {
                    subcategoryName = NormalizeImportedValue(property.Value.GetString());
                }
            }

            return (categoryName, subcategoryName);
        }
        catch (JsonException)
        {
            return (null, null);
        }
    }

    private static string? NormalizeImportedValue(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
