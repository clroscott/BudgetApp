using BudgetApp.Application.Accounts;
using BudgetApp.Application.Households;
using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.Households;
using BudgetApp.Domain.Imports;

namespace BudgetApp.Application.Imports;

public sealed class CsvImportService(
    IAccountRepository accountRepository,
    IImportRepository importRepository,
    ICsvImportReader csvImportReader,
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

        var readResult = await csvImportReader.ReadAsync(content, cancellationToken);
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

        var drafts = readResult.Rows
            .Select(row => ImportTransactionDraft.Create(
                importFile.Id,
                row.SourceRowNumber,
                row.RawData,
                row.TransactionDate,
                row.Amount,
                row.Description,
                row.ValidationMessage,
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
