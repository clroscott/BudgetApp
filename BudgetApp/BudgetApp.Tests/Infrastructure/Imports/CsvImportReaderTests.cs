using System.Text;
using BudgetApp.Application.Imports;
using BudgetApp.Infrastructure.Imports;

namespace BudgetApp.Tests.Infrastructure.Imports;

public sealed class CsvImportReaderTests
{
    private readonly CsvImportReader reader = new();

    [Fact]
    public async Task ReadAsync_ParsesSignedAmountRowsAndPreservesQuotedValues()
    {
        const string csv =
            "Date,Description,Amount\n" +
            "2026-07-20,\"Market, Main Street\",-47.25\n" +
            "not-a-date,Unclear purchase,12.34567\n" +
            "07/21/2026,Payroll,1250.00\n";

        var result = await Read(csv);

        Assert.Equal(Encoding.UTF8.GetByteCount(csv), result.FileSizeBytes);
        Assert.Equal(64, result.Sha256Hash.Length);
        Assert.Equal(3, result.Rows.Count);

        var expense = result.Rows[0];
        Assert.Equal(2, expense.SourceRowNumber);
        Assert.Equal(new DateOnly(2026, 7, 20), expense.TransactionDate);
        Assert.Equal(-47.25m, expense.Amount);
        Assert.Equal("Market, Main Street", expense.Description);
        Assert.Null(expense.ValidationMessage);
        Assert.Contains("Market, Main Street", expense.RawData);

        var invalid = result.Rows[1];
        Assert.Null(invalid.TransactionDate);
        Assert.Equal(12.34567m, invalid.Amount);
        Assert.Contains("could not be parsed", invalid.ValidationMessage);

        var income = result.Rows[2];
        Assert.Equal(new DateOnly(2026, 7, 21), income.TransactionDate);
        Assert.Equal(1250m, income.Amount);
    }

    [Fact]
    public async Task ReadAsync_NormalizesDebitAndCreditColumns()
    {
        const string csv =
            "Transaction Date,Details,Debit,Credit\n" +
            "2026-07-20,Groceries,55.10,\n" +
            "2026-07-21,Refund,,12.25\n";

        var result = await Read(csv);

        Assert.Equal(-55.10m, result.Rows[0].Amount);
        Assert.Equal(12.25m, result.Rows[1].Amount);
        Assert.All(result.Rows, row => Assert.Null(row.ValidationMessage));
    }

    [Fact]
    public async Task ReadAsync_ParsesOptionalCategoryColumns()
    {
        const string csv =
            "Date,Description,Amount,Category,Sub Category\n" +
            "2026-07-20,Groceries,-55.10,Food & Dining,Groceries\n" +
            "2026-07-21,Uncategorized,-12.25,,\n";

        var result = await Read(csv);

        Assert.Equal("Food & Dining", result.Rows[0].CategoryName);
        Assert.Equal("Groceries", result.Rows[0].SubcategoryName);
        Assert.Null(result.Rows[1].CategoryName);
        Assert.Null(result.Rows[1].SubcategoryName);
    }

    [Fact]
    public async Task ReadAsync_WithUnknownLayout_IsRejected()
    {
        const string csv = "When,What,Value\n2026-07-20,Groceries,-10\n";

        var exception = await Assert.ThrowsAsync<CsvImportRejectedException>(() =>
            Read(csv));

        Assert.Contains("layout is not recognized", exception.Message);
        Assert.Contains("When, What, Value", exception.Message);
    }

    [Fact]
    public async Task ReadAsync_ProducesStableHashForSameContent()
    {
        const string csv = "Date,Description,Amount\n2026-07-20,Groceries,-10\n";

        var first = await Read(csv);
        var second = await Read(csv);

        Assert.Equal(first.Sha256Hash, second.Sha256Hash);
    }

    private Task<CsvImportReadResult> Read(string csv) =>
        reader.ReadAsync(
            new MemoryStream(Encoding.UTF8.GetBytes(csv)),
            CancellationToken.None);
}
