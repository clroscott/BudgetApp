using BudgetApp.Application.Auditing;
using BudgetApp.Application.Households;
using BudgetApp.Domain.Auditing;
using BudgetApp.Domain.Imports;

namespace BudgetApp.Application.Imports;

public sealed class ImportReversalService(
    IImportRepository imports, IImportReversalRepository reversals,
    HouseholdAuthorizationService authorization, AuditWriter audit, TimeProvider clock)
{
    public Task<ReverseImportResult> ReverseAsync(Guid householdId, Guid userId, Guid fileId,
        string previewVersion, bool confirmed, CancellationToken cancellationToken)
    {
        if (!confirmed) throw new ArgumentException("Confirm that the entire import should be undone.");
        if (string.IsNullOrEmpty(previewVersion) || previewVersion.Length != 64 || !previewVersion.All(char.IsAsciiHexDigit))
            throw new ArgumentException("Load a fresh undo preview before confirming.");
        return reversals.ExecuteAtomicAsync(async ct =>
        {
            // These reads are inside the transaction: permission changes, new
            // references and row edits cannot slip between validation and commit.
            var role = await authorization.RequireViewAsync(householdId, userId, ct);
            var access = await imports.GetAccessAsync(householdId, fileId, true, ct) ?? throw new ImportNotFoundException();
            ImportAuthorization.RequireEdit(access, role, userId);
            var file = access.ImportFile;
            if (file.Status == ImportFileStatus.Reversed)
                return new ReverseImportResult(fileId, "Reversed", file.ApprovedRowCount, file.UpdatedAtUtc, true);
            if (file.Status != ImportFileStatus.Completed)
                throw new ImportReversalConflictException("This import is not completed. Reload its status before trying again.");
            var snapshot = await reversals.GetSnapshotAsync(fileId, TransactionImportLimits.MaxRows, ct, forUpdate: true);
            var now = clock.GetUtcNow();
            var checkedPreview = ImportReversalPreviewService.Evaluate(access, snapshot, 1, now, ct);
            if (!checkedPreview.CanReverse || checkedPreview.PreviewVersion != previewVersion)
                throw new ImportReversalConflictException("This import or its transactions changed, or a row is blocked. Refresh the undo preview. Nothing was undone.");
            var previousVersion = file.UpdatedAtUtc;
            foreach (var record in snapshot.Transactions)
            {
                ct.ThrowIfCancellationRequested();
                var value = record.Transaction;
                value.Void(userId, now > value.UpdatedAtUtc ? now : value.UpdatedAtUtc.AddTicks(1));
            }
            file.Reverse(now);
            audit.Record(new AuditEventInput(householdId, userId,
                access.IsPersonalAccount ? AuditVisibility.Personal : AuditVisibility.Household,
                access.IsPersonalAccount ? access.AccountOwnerUserId : null,
                AuditActions.Reversed, AuditEntityTypes.Import, fileId,
                $"Undid an import ({snapshot.Transactions.Count} transactions). Original history was retained.",
                new Dictionary<string, string?> {
                    ["Import ID"] = fileId.ToString(), ["Transactions reversed"] = snapshot.Transactions.Count.ToString(),
                    ["Previous import version"] = previousVersion.ToString("O"), ["Import version"] = file.UpdatedAtUtc.ToString("O"),
                    ["Confirmed preview version"] = previewVersion
                }));
            await imports.SaveChangesAsync(ct);
            return new ReverseImportResult(fileId, "Reversed", snapshot.Transactions.Count, file.UpdatedAtUtc, false);
        }, cancellationToken);
    }
}
