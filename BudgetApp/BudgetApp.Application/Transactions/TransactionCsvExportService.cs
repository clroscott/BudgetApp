using System.Globalization;
using System.Text;
using BudgetApp.Application.Households;

namespace BudgetApp.Application.Transactions;

public sealed class TransactionCsvExportService(
    ITransactionRepository transactionRepository,
    HouseholdAuthorizationService authorizationService,
    TimeProvider timeProvider)
{
    private static readonly string[] Headers =
    [
        "Transaction Date",
        "Description",
        "Amount",
        "Currency",
        "Account",
        "Category",
        "Subcategory",
        "Budget Treatment",
        "Notes"
    ];

    public async Task<TransactionCsvExport> ExportAsync(
        Guid householdId,
        Guid userId,
        Guid? accountId,
        DateOnly? fromDate,
        DateOnly? toDate,
        string? categoryType,
        Guid? categoryId,
        bool uncategorizedOnly,
        string? descriptionSearch,
        CancellationToken cancellationToken)
    {
        await authorizationService.RequireViewAsync(
            householdId,
            userId,
            cancellationToken);

        var criteria = TransactionSearchCriteria.Create(
            accountId,
            fromDate,
            toDate,
            categoryType,
            categoryId,
            uncategorizedOnly,
            descriptionSearch);
        var transactions = await transactionRepository.ListVisibleForExportAsync(
            householdId,
            userId,
            criteria,
            cancellationToken);

        var csv = new StringBuilder();
        AppendRow(csv, Headers);

        foreach (var transaction in transactions)
        {
            AppendRow(csv,
            [
                transaction.TransactionDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                ProtectSpreadsheetText(transaction.Description),
                transaction.Amount.ToString("0.####", CultureInfo.InvariantCulture),
                ProtectSpreadsheetText(transaction.Currency),
                ProtectSpreadsheetText(transaction.AccountName),
                ProtectSpreadsheetText(transaction.CategoryName),
                ProtectSpreadsheetText(transaction.SubcategoryName),
                transaction.IsExcludedFromBudget ? "Excluded" : "Included",
                ProtectSpreadsheetText(transaction.Notes)
            ]);
        }

        var utf8 = new UTF8Encoding(encoderShouldEmitUTF8Identifier: true);
        var body = utf8.GetBytes(csv.ToString());
        var content = new byte[utf8.GetPreamble().Length + body.Length];
        utf8.GetPreamble().CopyTo(content, 0);
        body.CopyTo(content, utf8.GetPreamble().Length);

        var createdAt = timeProvider.GetUtcNow();
        return new TransactionCsvExport(
            content,
            $"budgetapp-transactions-{createdAt:yyyyMMdd-HHmmss}Z.csv",
            transactions.Count);
    }

    private static string ProtectSpreadsheetText(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return "";
        }

        var firstNonWhitespace = 0;
        while (firstNonWhitespace < value.Length &&
               char.IsWhiteSpace(value[firstNonWhitespace]))
        {
            firstNonWhitespace++;
        }

        return firstNonWhitespace < value.Length &&
               value[firstNonWhitespace] is '=' or '+' or '-' or '@'
            ? $"'{value}"
            : value;
    }

    private static void AppendRow(StringBuilder csv, IReadOnlyList<string> values)
    {
        for (var index = 0; index < values.Count; index++)
        {
            if (index > 0)
            {
                csv.Append(',');
            }

            AppendField(csv, values[index]);
        }

        csv.Append("\r\n");
    }

    private static void AppendField(StringBuilder csv, string value)
    {
        if (!value.Contains(',') &&
            !value.Contains('"') &&
            !value.Contains('\r') &&
            !value.Contains('\n'))
        {
            csv.Append(value);
            return;
        }

        csv.Append('"');
        csv.Append(value.Replace("\"", "\"\"", StringComparison.Ordinal));
        csv.Append('"');
    }
}
