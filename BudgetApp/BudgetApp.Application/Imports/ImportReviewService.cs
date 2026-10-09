using System.Text.Json;
using BudgetApp.Application.Auditing;
using BudgetApp.Application.Categories;
using BudgetApp.Application.CategorizationRules;
using BudgetApp.Application.Households;
using BudgetApp.Domain.Households;
using BudgetApp.Domain.Auditing;
using BudgetApp.Domain.Imports;
using BudgetApp.Domain.Transactions;

namespace BudgetApp.Application.Imports;

public sealed class ImportReviewService(
    IImportRepository importRepository,
    ICategoryRepository categoryRepository,
    ICategorizationRuleRepository categorizationRuleRepository,
    HouseholdAuthorizationService authorizationService,
    TimeProvider timeProvider,
    AuditWriter? auditWriter = null)
{
    public const int ImportListPageSize = 50;

    public async Task<ImportListResult> ListAsync(
        Guid householdId,
        Guid userId,
        ImportListFilter filter,
        int page,
        CancellationToken cancellationToken)
    {
        if (!Enum.IsDefined(filter)) throw new ArgumentException("Choose a supported import filter.", nameof(filter));
        if (page < 1) throw new ArgumentException("Import page must be at least 1.", nameof(page));
        var role = await authorizationService.RequireViewAsync(
            householdId, userId, cancellationToken);
        var result = await importRepository.ListVisibleAsync(
            householdId, userId, filter, page, ImportListPageSize, cancellationToken);
        var items = result.Items
            .Select(record => new ImportListItem(
                record.Id,
                record.OriginalFileName,
                record.AccountName,
                record.Status,
                record.TotalRows,
                record.ValidRows,
                record.InvalidRows,
                record.ApprovedRows,
                record.ExcludedRows,
                record.DuplicateRows,
                record.UploadedAtUtc,
                CanEdit(record.IsPersonalAccount, record.AccountOwnerUserId, role, userId),
                record.SourceWorksheetName))
            .ToList();
        return new ImportListResult(items, result.Page, ImportListPageSize, result.TotalCount,
            (int)Math.Ceiling((double)result.TotalCount / ImportListPageSize), result.TotalVisibleCount);
    }

    public async Task<ImportSummary> GetSummaryAsync(Guid householdId, Guid userId, CancellationToken cancellationToken)
    {
        await authorizationService.RequireViewAsync(householdId, userId, cancellationToken);
        return await importRepository.GetSummaryAsync(householdId, userId, cancellationToken);
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

    public async Task<ApplyCategorizationRulesResult> ApplyCategorizationRulesAsync(
        Guid householdId,
        Guid userId,
        Guid importFileId,
        bool replaceExistingCategories,
        CancellationToken cancellationToken)
    {
        var (access, role) = await GetAuthorized(
            householdId,
            userId,
            importFileId,
            forUpdate: true,
            cancellationToken);
        RequireEdit(access, role, userId);
        RequireReviewable(access.ImportFile);

        var rules = (await categorizationRuleRepository.ListAsync(
                householdId,
                forUpdate: false,
                cancellationToken))
            .Where(rule => rule.IsActive)
            .OrderBy(rule => rule.Priority)
            .ToList();
        if (rules.Count == 0)
        {
            return new ApplyCategorizationRulesResult(0, 0, 0);
        }

        var activeCategories = (await categoryRepository.ListAsync(
                householdId,
                cancellationToken))
            .Where(category => category.IsActive)
            .ToDictionary(category => category.Id);
        var drafts = await importRepository.ListDraftsAsync(
            importFileId,
            forUpdate: true,
            cancellationToken);
        var now = timeProvider.GetUtcNow();
        var changedRows = 0;
        var unchangedRows = 0;

        foreach (var draft in drafts.Where(draft =>
                     draft.ReviewDecision is ImportDraftReviewDecision.Pending or
                         ImportDraftReviewDecision.Approved))
        {
            var targetCategoryId = rules
                .FirstOrDefault(rule =>
                    activeCategories.ContainsKey(rule.TargetCategoryId) &&
                    rule.Matches(access.ImportFile.AccountId, draft.Description))
                ?.TargetCategoryId;
            if (!targetCategoryId.HasValue)
            {
                continue;
            }

            var targetCategory = activeCategories[targetCategoryId.Value];
            var canFillWithoutReplacing =
                !draft.SelectedCategoryId.HasValue ||
                targetCategory.ParentCategoryId == draft.SelectedCategoryId;
            if (!replaceExistingCategories && !canFillWithoutReplacing)
            {
                continue;
            }

            if (draft.SelectedCategoryId == targetCategoryId)
            {
                unchangedRows++;
                continue;
            }

            draft.SetSuggestedCategory(targetCategoryId, now);
            draft.SelectCategory(targetCategoryId, now);
            changedRows++;
        }

        if (changedRows > 0)
        {
            RecordImportEvent(
                access,
                userId,
                AuditActions.Updated,
                $"Applied categorization rules to '{access.ImportFile.OriginalFileName}'.",
                new Dictionary<string, string?>
                {
                    ["Rows changed"] = changedRows.ToString(),
                    ["Rows unchanged"] = unchangedRows.ToString(),
                    ["Existing categories replaced"] =
                        replaceExistingCategories ? "Yes" : "No"
                });
        }

        await importRepository.SaveChangesAsync(cancellationToken);
        return new ApplyCategorizationRulesResult(
            changedRows + unchangedRows,
            changedRows,
            unchangedRows);
    }

    public async Task<CategorizationRuleApplicationPreview>
        PreviewCategorizationRulesAsync(
            Guid householdId,
            Guid userId,
            Guid importFileId,
            CancellationToken cancellationToken)
    {
        var (access, role) = await GetAuthorized(
            householdId,
            userId,
            importFileId,
            forUpdate: false,
            cancellationToken);
        RequireEdit(access, role, userId);
        RequireReviewable(access.ImportFile);

        var rules = (await categorizationRuleRepository.ListAsync(
                householdId,
                forUpdate: false,
                cancellationToken))
            .Where(rule => rule.IsActive)
            .OrderBy(rule => rule.Priority)
            .ToList();
        if (rules.Count == 0)
        {
            return new CategorizationRuleApplicationPreview(0, 0, 0);
        }

        var activeCategories = (await categoryRepository.ListAsync(
                householdId,
                cancellationToken))
            .Where(category => category.IsActive)
            .ToDictionary(category => category.Id);
        var drafts = await importRepository.ListDraftsAsync(
            importFileId,
            forUpdate: false,
            cancellationToken);
        var fillChangedRows = 0;
        var reapplyChangedRows = 0;
        var reapplyUnchangedRows = 0;

        foreach (var draft in drafts.Where(draft =>
                     draft.ReviewDecision is ImportDraftReviewDecision.Pending or
                         ImportDraftReviewDecision.Approved))
        {
            var targetCategoryId = rules
                .FirstOrDefault(rule =>
                    activeCategories.ContainsKey(rule.TargetCategoryId) &&
                    rule.Matches(access.ImportFile.AccountId, draft.Description))
                ?.TargetCategoryId;
            if (!targetCategoryId.HasValue)
            {
                continue;
            }

            if (draft.SelectedCategoryId == targetCategoryId)
            {
                reapplyUnchangedRows++;
                continue;
            }

            reapplyChangedRows++;
            var targetCategory = activeCategories[targetCategoryId.Value];
            if (!draft.SelectedCategoryId.HasValue ||
                targetCategory.ParentCategoryId == draft.SelectedCategoryId)
            {
                fillChangedRows++;
            }
        }

        return new CategorizationRuleApplicationPreview(
            fillChangedRows,
            reapplyChangedRows,
            reapplyUnchangedRows);
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
        CancellationToken cancellationToken,
        bool? includeHousehold = null, bool? includePersonal = null)
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
        ApplyBudgetInclusion(draft, access, role, userId, includeHousehold, includePersonal, now);
        await ApplyDuplicateResults(access.ImportFile.AccountId, [draft], cancellationToken);
        access.ImportFile.RefreshStatistics(CalculateStatistics(drafts), now);
        RecordImportEvent(
            access,
            userId,
            AuditActions.Updated,
            $"Corrected a staged row in '{access.ImportFile.OriginalFileName}'.",
            new Dictionary<string, string?>
            {
                ["Import row"] = draft.SourceRowNumber.ToString()
            });
        await importRepository.SaveChangesAsync(cancellationToken);
    }

    public async Task<int> BulkUpdateDraftsAsync(
        Guid householdId,
        Guid userId,
        Guid importFileId,
        IReadOnlyList<ImportDraftUpdateInput> updates,
        CancellationToken cancellationToken)
    {
        if (updates.Count == 0 ||
            updates.Select(update => update.DraftId).Distinct().Count() != updates.Count)
        {
            throw new ArgumentException(
                "Provide one update for each changed import row.",
                nameof(updates));
        }

        var (access, role) = await GetAuthorized(
            householdId,
            userId,
            importFileId,
            forUpdate: true,
            cancellationToken);
        RequireEdit(access, role, userId);
        RequireReviewable(access.ImportFile);

        var drafts = await importRepository.ListDraftsAsync(
            importFileId,
            forUpdate: true,
            cancellationToken);
        var draftsById = drafts.ToDictionary(draft => draft.Id);
        if (updates.Any(update => !draftsById.ContainsKey(update.DraftId)))
        {
            throw new ImportDraftNotFoundException();
        }

        var categories = (await categoryRepository.ListAsync(
                householdId,
                cancellationToken))
            .ToDictionary(category => category.Id);
        var now = timeProvider.GetUtcNow();
        var updatedDrafts = new List<ImportTransactionDraft>(updates.Count);

        foreach (var update in updates)
        {
            var draft = draftsById[update.DraftId];
            if (update.SelectedCategoryId.HasValue)
            {
                if (!categories.TryGetValue(
                        update.SelectedCategoryId.Value,
                        out var category))
                {
                    throw new CategoryNotFoundException();
                }

                if (!category.IsActive &&
                    draft.SelectedCategoryId != category.Id)
                {
                    throw new InvalidOperationException(
                        "A deactivated category cannot be assigned.");
                }
            }

            draft.CorrectParsedValues(
                update.TransactionDate,
                update.Amount,
                update.Description,
                update.SelectedCategoryId,
                now);
            ApplyBudgetInclusion(draft, access, role, userId,
                update.IncludeInHouseholdBudget, update.IncludeInPersonalBudget, now);
            updatedDrafts.Add(draft);
        }

        await ApplyDuplicateResults(
            access.ImportFile.AccountId,
            updatedDrafts,
            cancellationToken);
        access.ImportFile.RefreshStatistics(CalculateStatistics(drafts), now);
        RecordImportEvent(
            access,
            userId,
            AuditActions.Updated,
            $"Corrected {updatedDrafts.Count} staged rows in " +
            $"'{access.ImportFile.OriginalFileName}'.",
            new Dictionary<string, string?>
            {
                ["Rows corrected"] = updatedDrafts.Count.ToString()
            });
        await importRepository.SaveChangesAsync(cancellationToken);
        return updatedDrafts.Count;
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
            case "excluded":
                draft.Exclude(userId, now);
                break;
            case "pending":
                draft.MarkPending(now);
                break;
            default:
                throw new ArgumentException("Review decision is not supported.", nameof(decision));
        }

        access.ImportFile.RefreshStatistics(CalculateStatistics(drafts), now);
        var action = decision.Trim().Equals(
            "approved",
            StringComparison.OrdinalIgnoreCase)
            ? AuditActions.Approved
            : decision.Trim().Equals(
                "excluded",
                StringComparison.OrdinalIgnoreCase)
                ? AuditActions.Excluded
                : AuditActions.Updated;
        RecordImportEvent(
            access,
            userId,
            action,
            $"{action} import row {draft.SourceRowNumber} in " +
            $"'{access.ImportFile.OriginalFileName}'.");
        await importRepository.SaveChangesAsync(cancellationToken);
    }

    public async Task BulkSetDecisionAsync(
        Guid householdId,
        Guid userId,
        Guid importFileId,
        string decision,
        CancellationToken cancellationToken)
    {
        var (access, role) = await GetAuthorized(
            householdId, userId, importFileId, forUpdate: true, cancellationToken);
        RequireEdit(access, role, userId);
        RequireReviewable(access.ImportFile);
        var drafts = await importRepository.ListDraftsAsync(
            importFileId, forUpdate: true, cancellationToken);
        var pendingDrafts = drafts.Where(draft =>
            draft.ReviewDecision == ImportDraftReviewDecision.Pending).ToList();
        var normalizedDecision = decision.Trim().ToLowerInvariant();
        var now = timeProvider.GetUtcNow();
        var affectedRows = 0;

        switch (normalizedDecision)
        {
            case "approved":
                var validDrafts = pendingDrafts.Where(draft =>
                    draft.ValidationStatus == ImportDraftValidationStatus.Valid).ToList();
                await ApplyDuplicateResults(
                    access.ImportFile.AccountId,
                    validDrafts,
                    cancellationToken);
                foreach (var draft in validDrafts)
                {
                    draft.Approve(userId, acknowledgePossibleDuplicate: true, now);
                }
                affectedRows = validDrafts.Count;
                break;
            case "excluded":
                foreach (var draft in pendingDrafts)
                {
                    draft.Exclude(userId, now);
                }
                affectedRows = pendingDrafts.Count;
                break;
            case "pending":
                var reviewedDrafts = drafts.Where(draft =>
                        draft.ReviewDecision != ImportDraftReviewDecision.Pending)
                    .ToList();
                foreach (var draft in reviewedDrafts)
                {
                    draft.MarkPending(now);
                }
                affectedRows = reviewedDrafts.Count;
                break;
            default:
                throw new ArgumentException(
                    "Review decision is not supported.",
                    nameof(decision));
        }

        access.ImportFile.RefreshStatistics(CalculateStatistics(drafts), now);
        if (affectedRows > 0)
        {
            var (auditAction, verb) = normalizedDecision switch
            {
                "approved" => (AuditActions.Approved, "Approved"),
                "excluded" => (AuditActions.Excluded, "Excluded"),
                _ => (AuditActions.Updated, "Returned to pending")
            };
            RecordImportEvent(
                access,
                userId,
                auditAction,
                $"{verb} {affectedRows} staged rows in " +
                $"'{access.ImportFile.OriginalFileName}'.",
                new Dictionary<string, string?>
                {
                    ["Rows affected"] = affectedRows.ToString()
                });
        }

        await importRepository.SaveChangesAsync(cancellationToken);
    }

    public async Task RemoveDraftAsync(
        Guid householdId,
        Guid userId,
        Guid importFileId,
        Guid draftId,
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
        if (drafts.Count == 1)
        {
            throw new InvalidOperationException(
                "The final staged row cannot be removed. Discard the staged import instead.");
        }

        var remainingDrafts = drafts.Where(candidate => candidate.Id != draftId).ToList();
        importRepository.RemoveDraft(draft);
        access.ImportFile.RefreshStatisticsAfterRowRemoval(
            CalculateStatistics(remainingDrafts),
            timeProvider.GetUtcNow());
        RecordImportEvent(
            access,
            userId,
            AuditActions.Deleted,
            $"Removed import row {draft.SourceRowNumber} from " +
            $"'{access.ImportFile.OriginalFileName}'.");
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
                importFile.ExcludedRowCount,
                importFile.Status.ToString());
        }

        RequireReviewable(importFile);
        var statistics = CalculateStatistics(drafts);
        if (statistics.PendingRows != 0)
        {
            throw new InvalidOperationException(
                "Every row must be approved or excluded before completing the import.");
        }

        var now = timeProvider.GetUtcNow();
        var transactions = new List<Transaction>();
        foreach (var draft in drafts.Where(draft =>
                     draft.ReviewDecision == ImportDraftReviewDecision.Approved &&
                     !draft.ApprovedTransactionId.HasValue))
        {
            var transaction = Transaction.CreateImported(
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
                now);
            transaction.InitializeBudgetInclusion(!access.IsPersonalAccount, access.AccountOwnerUserId);
            if (draft.IncludeInHouseholdBudget.HasValue)
                transaction.SetBudgetInclusionForUser(
                    draft.PersonalBudgetUserId ?? userId, draft.IncludeInHouseholdBudget,
                    draft.PersonalBudgetUserId.HasValue, now);
            transaction.MarkReviewed(userId, now);
            draft.LinkApprovedTransaction(transaction, now);
            transactions.Add(transaction);
        }

        await importRepository.AddTransactionsAsync(transactions, cancellationToken);
        importFile.Complete(statistics, now);
        RecordImportEvent(
            access,
            userId,
            AuditActions.Approved,
            $"Created {transactions.Count} transactions from " +
            $"'{importFile.OriginalFileName}'.",
            new Dictionary<string, string?>
            {
                ["Transactions created"] = transactions.Count.ToString(),
                ["Rows approved"] = importFile.ApprovedRowCount.ToString(),
                ["Rows excluded"] = importFile.ExcludedRowCount.ToString()
            });
        await importRepository.SaveChangesAsync(cancellationToken);
        return new CompleteImportResult(
            importFile.Id, transactions.Count, importFile.ApprovedRowCount,
            importFile.ExcludedRowCount,
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

        RecordImportEvent(
            access,
            userId,
            AuditActions.Deleted,
            $"Discarded staged import '{access.ImportFile.OriginalFileName}'.",
            new Dictionary<string, string?>
            {
                ["Rows discarded"] = access.ImportFile.TotalRowCount.ToString()
            });
        importRepository.Remove(access.ImportFile);
        await importRepository.SaveChangesAsync(cancellationToken);
    }

    private void RecordImportEvent(
        ImportAccessRecord access,
        Guid actorUserId,
        string action,
        string summary,
        IReadOnlyDictionary<string, string?>? details = null)
    {
        auditWriter?.Record(new AuditEventInput(
            access.ImportFile.HouseholdId,
            actorUserId,
            access.IsPersonalAccount
                ? AuditVisibility.Personal
                : AuditVisibility.Household,
            access.IsPersonalAccount ? access.AccountOwnerUserId : null,
            action,
            AuditEntityTypes.Import,
            access.ImportFile.Id,
            summary,
            details));
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
        // TryAdd preserves FirstOrDefault's first supplied match for duplicate keys.
        var candidateIds = new Dictionary<DuplicateMatchKey, Guid>(DuplicateMatchKeyComparer.Instance);
        foreach (var candidate in candidates)
        {
            candidateIds.TryAdd(new DuplicateMatchKey(
                candidate.TransactionDate, candidate.Amount, candidate.Description.Trim()), candidate.TransactionId);
        }

        var now = timeProvider.GetUtcNow();
        foreach (var draft in drafts)
        {
            Guid? matchingId = null;
            if (draft.TransactionDate is { } date && draft.Amount is { } amount && draft.Description is { } description &&
                candidateIds.TryGetValue(new DuplicateMatchKey(date, amount, description.Trim()), out var candidateId))
            {
                matchingId = candidateId;
            }
            draft.SetDuplicateResult(
                matchingId is null
                    ? ImportDraftDuplicateStatus.NoMatch
                    : ImportDraftDuplicateStatus.PossibleDuplicate,
                matchingId,
                now);
        }
    }

    private readonly record struct DuplicateMatchKey(DateOnly Date, decimal Amount, string Description);

    private sealed class DuplicateMatchKeyComparer : IEqualityComparer<DuplicateMatchKey>
    {
        internal static readonly DuplicateMatchKeyComparer Instance = new();

        public bool Equals(DuplicateMatchKey x, DuplicateMatchKey y) =>
            x.Date == y.Date && x.Amount == y.Amount &&
            StringComparer.OrdinalIgnoreCase.Equals(x.Description, y.Description);

        public int GetHashCode(DuplicateMatchKey key) => HashCode.Combine(
            key.Date, key.Amount, StringComparer.OrdinalIgnoreCase.GetHashCode(key.Description));
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
            drafts.Count(draft => draft.ReviewDecision == ImportDraftReviewDecision.Excluded),
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
            file.InvalidRowCount, file.ApprovedRowCount, file.ExcludedRowCount,
            file.DuplicateRowCount,
            CanEdit(access.IsPersonalAccount, access.AccountOwnerUserId, role, userId),
            drafts.Select(draft => ToDraftItem(draft, access, role, userId)).ToList(), file.SourceWorksheetName);
    }

    private static ImportDraftItem ToDraftItem(ImportTransactionDraft draft, ImportAccessRecord access, HouseholdRole role, Guid userId)
    {
        var (categoryName, subcategoryName) = ReadImportedCategoryNames(draft.RawData);
        return new ImportDraftItem(
            draft.Id, draft.SourceRowNumber, draft.TransactionDate, draft.Amount,
            draft.Description, categoryName, subcategoryName, draft.SelectedCategoryId,
            draft.ValidationStatus.ToString(), draft.ValidationMessage,
            draft.DuplicateStatus.ToString(), draft.PossibleMatchingTransactionId,
            draft.ReviewDecision.ToString(), draft.IsDuplicateAcknowledged,
            draft.ApprovedTransactionId,
            draft.IncludeInHouseholdBudget ?? !access.IsPersonalAccount,
            draft.IncludeInHouseholdBudget.HasValue ? draft.PersonalBudgetUserId == userId :
                access.IsPersonalAccount && access.AccountOwnerUserId == userId,
            !draft.PersonalBudgetUserId.HasValue || draft.PersonalBudgetUserId == userId,
            role != HouseholdRole.Viewer);
    }

    private static void ApplyBudgetInclusion(ImportTransactionDraft draft,
        ImportAccessRecord access, HouseholdRole role, Guid userId,
        bool? household, bool? personal, DateTimeOffset now)
    {
        if (!household.HasValue && !personal.HasValue) return;
        var previousHousehold = draft.IncludeInHouseholdBudget ?? !access.IsPersonalAccount;
        var owner = draft.IncludeInHouseholdBudget.HasValue ? draft.PersonalBudgetUserId :
            access.IsPersonalAccount ? access.AccountOwnerUserId : null;
        if (household.HasValue && household != previousHousehold && role == HouseholdRole.Viewer)
            throw new HouseholdAccessDeniedException();
        if (personal == true && owner.HasValue && owner != userId)
            throw new InvalidOperationException("Another user's personal inclusion cannot be reassigned.");
        if (personal == true) owner = userId;
        else if (personal == false && owner == userId) owner = null;
        draft.SetBudgetInclusion(household ?? previousHousehold, owner, now);
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
