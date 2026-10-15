using BudgetApp.Application.Households;
using BudgetApp.Domain.Imports;
using BudgetApp.Domain.Transactions;
using System.Security.Cryptography;
using System.Text;

namespace BudgetApp.Application.Imports;

public sealed class ImportReversalPreviewService(
    IImportRepository imports, IImportReversalRepository reversals,
    HouseholdAuthorizationService authorization, TimeProvider clock)
{
    public const int PageSize = 100;

    public async Task<ImportReversalPreview> GetAsync(
        Guid householdId, Guid userId, Guid importFileId, int page, CancellationToken cancellationToken)
    {
        if (page < 1) throw new ArgumentException("Preview page must be at least 1.");
        var role = await authorization.RequireViewAsync(householdId, userId, cancellationToken);
        var access = await imports.GetAccessAsync(householdId, importFileId, false, cancellationToken)
            ?? throw new ImportNotFoundException();
        ImportAuthorization.RequireEdit(access, role, userId);
        if (access.ImportFile.Status == ImportFileStatus.Reversed)
            return new(access.ImportFile.Id, access.ImportFile.OriginalFileName, access.AccountName, access.Currency,
                access.ImportFile.SourceWorksheetName, access.ImportFile.UpdatedAtUtc, clock.GetUtcNow(), false,
                access.ImportFile.ApprovedRowCount, 0, 0, ["This import has already been undone. Its history is retained."],
                [], 1, PageSize, 0, 0, "", "Reversed");
        if (access.ImportFile.Status != ImportFileStatus.Completed)
            throw new InvalidOperationException("Only a completed import can be previewed for reversal.");

        var snapshot = await reversals.GetSnapshotAsync(importFileId, TransactionImportLimits.MaxRows, cancellationToken);
        return Evaluate(access, snapshot, page, clock.GetUtcNow(), cancellationToken);
    }

    internal static ImportReversalPreview Evaluate(ImportAccessRecord access, ImportReversalSnapshot snapshot,
        int page, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var householdId = access.ImportFile.HouseholdId;
        if (snapshot.Drafts.Count > TransactionImportLimits.MaxRows || snapshot.Transactions.Count > TransactionImportLimits.MaxRows)
            throw new InvalidOperationException("This import exceeds the supported reversal-preview size. No transactions were changed.");

        var file = access.ImportFile;
        var global = new List<string>();
        var approved = snapshot.Drafts.Where(d => d.Decision == ImportDraftReviewDecision.Approved).ToList();
        if (snapshot.Drafts.Count != file.TotalRowCount || approved.Count != file.ApprovedRowCount ||
            snapshot.Drafts.Count(d => d.Decision == ImportDraftReviewDecision.Excluded) != file.ExcludedRowCount ||
            snapshot.Drafts.Any(d => d.Decision == ImportDraftReviewDecision.Pending ||
                d.Decision != ImportDraftReviewDecision.Approved && d.TransactionId.HasValue))
            global.Add("The retained import rows do not match the completed import history.");

        var transactions = snapshot.Transactions.ToDictionary(t => t.Transaction.Id);
        var linkCounts = approved.Where(d => d.TransactionId.HasValue).GroupBy(d => d.TransactionId!.Value)
            .ToDictionary(g => g.Key, g => g.Count());
        var rows = new List<ImportReversalPreviewRow>();
        foreach (var draft in approved)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var reasons = new List<string>();
            var record = draft.TransactionId.HasValue ? transactions.GetValueOrDefault(draft.TransactionId.Value) : null;
            var transaction = record?.Transaction;
            var matches = transaction is not null && transaction.HouseholdId == householdId &&
                transaction.AccountId == file.AccountId && transaction.ImportFileId == file.Id &&
                transaction.ImportRowNumber == draft.SourceRowNumber && transaction.Source == TransactionSource.Import;
            if (transaction is null) reasons.Add("The original official transaction is missing or is not linked.");
            else if (!matches) reasons.Add("The official transaction linkage does not match this import row.");
            else
            {
                if (transaction!.IsVoided) reasons.Add("This transaction has already been voided.");
                if (record!.HasOtherApprovalLinks || linkCounts[transaction.Id] != 1)
                    reasons.Add("This transaction is linked to another approved row.");
                if (record.HasRecordedChanges || !MatchesOriginal(transaction, draft, access))
                    reasons.Add("This transaction was changed after import approval.");
            }
            rows.Add(new(draft.Id, draft.SourceRowNumber, matches ? transaction!.Id : null,
                draft.Date, draft.Amount, draft.Description, draft.UpdatedAtUtc,
                matches ? transaction!.UpdatedAtUtc : null, reasons.Count == 0, reasons));
        }
        var linkedIds = approved.Where(d => d.TransactionId.HasValue).Select(d => d.TransactionId!.Value).ToHashSet();
        foreach (var record in snapshot.Transactions.Where(t => !linkedIds.Contains(t.Transaction.Id)))
        {
            // Do not return financial values from unexpected/mismatched records.
            rows.Add(new(null, record.Transaction.ImportRowNumber, null, null, null, null, null, null, false,
                ["An official transaction has no matching approved import row."]));
        }
        if (rows.Count == 0) global.Add("This import created no transactions to reverse.");
        if (rows.Any(row => !row.IsEligible))
            global.Add("At least one row is blocked. The entire import must remain unchanged; partial reversal is not supported.");
        var ordered = rows.OrderBy(row => row.SourceRowNumber ?? int.MaxValue).ThenBy(row => row.DraftId).ToList();
        var totalPages = (int)Math.Ceiling((double)rows.Count / PageSize);
        var selectedPage = Math.Min(page, Math.Max(1, totalPages));
        return new(file.Id, file.OriginalFileName, access.AccountName, access.Currency, file.SourceWorksheetName,
            file.UpdatedAtUtc, now, global.Count == 0, snapshot.Transactions.Count,
            rows.Count(row => row.IsEligible), rows.Count(row => !row.IsEligible), global,
            ordered.Skip((selectedPage - 1) * PageSize).Take(PageSize).ToList(),
            selectedPage, PageSize, rows.Count, totalPages, Fingerprint(access, snapshot));
    }

    private static string Fingerprint(ImportAccessRecord access, ImportReversalSnapshot snapshot)
    {
        // A comparison version, not a bearer credential. Confirmation always
        // reauthorizes and reevaluates every row inside the serializable command.
        var data = new StringBuilder().Append(access.ImportFile.Id).Append('|')
            .Append(access.ImportFile.UpdatedAtUtc.ToString("O")).Append('|').Append(access.Currency);
        foreach (var draft in snapshot.Drafts.OrderBy(d => d.Id))
            data.Append('|').Append(draft.Id).Append(':').Append(draft.UpdatedAtUtc.ToString("O")).Append(':').Append(draft.TransactionId);
        foreach (var record in snapshot.Transactions.OrderBy(t => t.Transaction.Id))
            data.Append('|').Append(record.Transaction.Id).Append(':').Append(record.Transaction.UpdatedAtUtc.ToString("O"));
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(data.ToString())));
    }

    private static bool MatchesOriginal(Transaction value, ImportReversalDraftRecord draft, ImportAccessRecord access)
    {
        var expectedPersonal = draft.IncludeHousehold.HasValue ? draft.PersonalUserId :
            access.IsPersonalAccount ? access.AccountOwnerUserId : null;
        var expectedHousehold = draft.IncludeHousehold ?? !access.IsPersonalAccount;
        return value.UpdatedAtUtc == value.CreatedAtUtc && value.CreatedAtUtc == draft.UpdatedAtUtc &&
            value.TransactionDate == draft.Date && value.Amount == draft.Amount && value.CategoryId == draft.CategoryId &&
            value.Description == draft.Description && value.OriginalDescription == draft.OriginalDescription &&
            value.PostedDate is null && value.MerchantName is null && value.Notes is null &&
            value.ReviewStatus == TransactionReviewStatus.Reviewed &&
            (value.IncludeInHouseholdBudget ?? !access.IsPersonalAccount) == expectedHousehold &&
            value.IsExcludedFromBudget == (!expectedHousehold && !expectedPersonal.HasValue) &&
            value.PersonalBudgetInclusions.Select(i => i.UserId).Order().SequenceEqual(
                expectedPersonal.HasValue ? new[] { expectedPersonal.Value } : []);
    }
}
