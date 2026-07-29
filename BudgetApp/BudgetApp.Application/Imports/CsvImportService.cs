using BudgetApp.Application.Accounts;
using BudgetApp.Application.Categories;
using BudgetApp.Application.CategorizationRules;
using BudgetApp.Application.Households;
using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.CategorizationRules;
using BudgetApp.Domain.Households;
using BudgetApp.Domain.Imports;

namespace BudgetApp.Application.Imports;

public sealed class CsvImportService(
    IAccountRepository accountRepository,
    ICategoryRepository categoryRepository,
    ICategorizationRuleRepository categorizationRuleRepository,
    IImportRepository importRepository,
    ICsvImportReader csvImportReader,
    ImportProfileService importProfileService,
    ImportReviewService importReviewService,
    HouseholdAuthorizationService authorizationService,
    TimeProvider timeProvider)
{
    public async Task<CsvImportResult> UploadAsync(
        Guid householdId,
        Guid userId,
        Guid accountId,
        string originalFileName,
        Stream content,
        bool allowDuplicateFile,
        Guid? profileId,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(content);

        var normalizedFileName = ValidateFileName(originalFileName);
        var role = await authorizationService.RequireViewAsync(
            householdId,
            userId,
            cancellationToken);
        var account = await accountRepository.GetForUpdateAsync(
            householdId,
            accountId,
            cancellationToken) ?? throw new AccountNotFoundException();

        RequireImportPermission(account, role, userId);

        var profile = profileId.HasValue
            ? await importProfileService.ResolveAsync(
                householdId, profileId.Value, cancellationToken)
            : null;
        var readResult = profile is null
            ? await csvImportReader.ReadAsync(content, cancellationToken)
            : await csvImportReader.ReadAsync(content, profile, cancellationToken);
        if (!allowDuplicateFile &&
            await importRepository.ExistsByAccountAndHashAsync(
                account.Id,
                readResult.Sha256Hash,
                cancellationToken))
        {
            throw new DuplicateCsvImportException();
        }

        var now = timeProvider.GetUtcNow();
        var importFile = ImportFile.Create(
            householdId,
            account.Id,
            userId,
            normalizedFileName,
            readResult.FileSizeBytes,
            readResult.Sha256Hash,
            now);
        importFile.StartProcessing(now);

        var categories = await categoryRepository.ListAsync(
            householdId,
            cancellationToken);
        var categorizationRules = (await categorizationRuleRepository.ListAsync(
                householdId,
                forUpdate: false,
                cancellationToken))
            .Where(rule => rule.IsActive)
            .OrderBy(rule => rule.Priority)
            .ToList();
        var drafts = readResult.Rows
            .Select(row => CreateDraft(
                row,
                categories,
                categorizationRules,
                account.Id,
                importFile.Id,
                now))
            .ToList();
        var validRows = drafts.Count(draft =>
            draft.ValidationStatus == ImportDraftValidationStatus.Valid);
        var invalidRows = drafts.Count - validRows;
        await importReviewService.ApplyDuplicateResults(
            account.Id,
            drafts,
            cancellationToken);
        var statistics = new ImportStatistics(
            drafts.Count,
            validRows,
            invalidRows,
            approvedRows: 0,
            rejectedRows: 0,
            skippedRows: 0,
            duplicateRows: drafts.Count(draft =>
                draft.DuplicateStatus == ImportDraftDuplicateStatus.PossibleDuplicate));

        importFile.MarkReadyForReview(statistics, now);
        await importRepository.AddAsync(importFile, drafts, cancellationToken);
        await importRepository.SaveChangesAsync(cancellationToken);

        return new CsvImportResult(
            importFile.Id,
            importFile.OriginalFileName,
            account.Name,
            importFile.Status.ToString(),
            importFile.TotalRowCount,
            importFile.ValidRowCount,
            importFile.InvalidRowCount,
            importFile.DuplicateRowCount);
    }

    private static ImportTransactionDraft CreateDraft(
        CsvImportRow row,
        IReadOnlyList<CategoryRecord> categories,
        IReadOnlyList<CategorizationRule> categorizationRules,
        Guid accountId,
        Guid importFileId,
        DateTimeOffset now)
    {
        var draft = ImportTransactionDraft.Create(
            importFileId,
            row.SourceRowNumber,
            row.RawData,
            row.TransactionDate,
            row.Amount,
            row.Description,
            row.ValidationMessage,
            now);
        var match = FindCategoryMatch(row, categories);
        match ??= FindRuleMatch(
            row,
            categories,
            categorizationRules,
            accountId);
        if (match is not null)
        {
            draft.SetSuggestedCategory(match.Id, now);
            draft.SelectCategory(match.Id, now);
        }

        return draft;
    }

    private static CategoryRecord? FindRuleMatch(
        CsvImportRow row,
        IReadOnlyList<CategoryRecord> categories,
        IReadOnlyList<CategorizationRule> rules,
        Guid accountId)
    {
        var targetId = rules
            .FirstOrDefault(rule => rule.Matches(accountId, row.Description))
            ?.TargetCategoryId;
        return targetId.HasValue
            ? categories.FirstOrDefault(category =>
                category.Id == targetId.Value &&
                category.IsActive)
            : null;
    }

    private static CategoryRecord? FindCategoryMatch(
        CsvImportRow row,
        IReadOnlyList<CategoryRecord> categories)
    {
        var active = categories.Where(category => category.IsActive).ToList();
        var categoryName = NormalizeCategoryName(row.CategoryName);
        var subcategoryName = NormalizeCategoryName(row.SubcategoryName);

        if (categoryName is not null)
        {
            var parent = active.FirstOrDefault(category =>
                category.ParentCategoryId is null &&
                category.NormalizedName == categoryName);
            if (parent is null || subcategoryName is null)
            {
                return parent;
            }

            return active.FirstOrDefault(category =>
                category.ParentCategoryId == parent.Id &&
                category.NormalizedName == subcategoryName);
        }

        if (subcategoryName is null)
        {
            return null;
        }

        var matches = active.Where(category =>
            category.ParentCategoryId.HasValue &&
            category.NormalizedName == subcategoryName).ToList();
        return matches.Count == 1 ? matches[0] : null;
    }

    private static string? NormalizeCategoryName(string? name) =>
        string.IsNullOrWhiteSpace(name) ? null : name.Trim().ToUpperInvariant();

    private static string ValidateFileName(string originalFileName)
    {
        if (string.IsNullOrWhiteSpace(originalFileName))
        {
            throw new CsvImportRejectedException("Select a CSV file to import.");
        }

        var trimmedFileName = originalFileName.Trim();
        if (!string.Equals(
                Path.GetExtension(trimmedFileName),
                ".csv",
                StringComparison.OrdinalIgnoreCase))
        {
            throw new CsvImportRejectedException("Only .csv files are supported.");
        }

        return trimmedFileName;
    }

    private static void RequireImportPermission(
        Account account,
        HouseholdRole role,
        Guid userId)
    {
        if (!account.IsActive)
        {
            throw new CsvImportRejectedException(
                "Transactions cannot be imported into an archived account.");
        }

        if (account.Scope == AccountScope.Personal && account.OwnerUserId != userId)
        {
            throw new AccountNotFoundException();
        }

        if (account.Scope == AccountScope.Household && role == HouseholdRole.Viewer)
        {
            throw new HouseholdAccessDeniedException();
        }
    }
}
