using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using BudgetApp.Application.Imports;
using BudgetApp.Domain.Imports;
using BudgetApp.Infrastructure.Imports;

namespace BudgetApp.Tests.Infrastructure.Imports;

public sealed class TransactionImportReaderTests
{
    private readonly ITransactionImportReader reader = new TransactionImportReader(new CsvImportReader(), new XlsxImportReader());

    [Theory]
    [InlineData("bank.csv")]
    [InlineData("BANK.CSV")]
    [InlineData(" bank.CsV ")]
    public async Task CsvDispatch_PreservesHashRawDataRowNumbersAndExactValues(string fileName)
    {
        const string csv = "Date,Description,Amount,Category,Subcategory\r\n" +
            "2026-07-20,\"0012 Market, Main Street\",-12.3456, Food , Groceries \r\n";
        var bytes = Encoding.UTF8.GetBytes(csv);
        using var stream = new MemoryStream(bytes);
        var result = await reader.ReadAsync(stream, fileName, default);
        Assert.Equal(fileName.Trim(), reader.ValidateFileName(fileName));
        Assert.Equal(bytes.Length, result.FileSizeBytes);
        Assert.Equal(Convert.ToHexString(SHA256.HashData(bytes)), result.Sha256Hash);
        var row = Assert.Single(result.Rows);
        Assert.Equal(2, row.SourceRowNumber);
        Assert.Equal(new DateOnly(2026, 7, 20), row.TransactionDate);
        Assert.Equal(-12.3456m, row.Amount);
        Assert.Equal("0012 Market, Main Street", row.Description);
        Assert.Equal("Food", row.CategoryName); Assert.Equal("Groceries", row.SubcategoryName);
        Assert.Null(row.ValidationMessage);
        var raw = JsonSerializer.Deserialize<Dictionary<string, string?>>(row.RawData)!;
        Assert.Equal(" Food ", raw["Category"]); Assert.Equal("-12.3456", raw["Amount"]);
        Assert.True(stream.CanRead); // The caller, not the format reader, owns the input.
    }

    [Theory]
    [InlineData("bank.xls")]
    [InlineData("bank.xlsm")]
    [InlineData("bank.csv.exe")]
    [InlineData("bank.txt")]
    [InlineData("bank")]
    public async Task UnsupportedFormats_AreRejectedByEveryEntryPointBeforeReading(string fileName)
    {
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes("Date,Description,Amount\n2026-07-20,Purchase,10\n"));
        var profile = Profile(["Date", "Description", "Amount"]);
        Assert.Contains("Only .csv and .xlsx files are supported.", Assert.Throws<TransactionImportRejectedException>(() => reader.ValidateFileName(fileName)).Message);
        await Assert.ThrowsAsync<TransactionImportRejectedException>(() => reader.InspectAsync(stream, fileName, default));
        await Assert.ThrowsAsync<TransactionImportRejectedException>(() => reader.ReadAsync(stream, fileName, default));
        await Assert.ThrowsAsync<TransactionImportRejectedException>(() => reader.ReadAsync(stream, fileName, profile, default));
        Assert.Equal(0, stream.Position);
    }

    [Theory]
    [InlineData("")]
    [InlineData("  ")]
    public void MissingName_RetainsExistingGuidance(string fileName) =>
        Assert.Equal("Select a CSV or Excel (.xlsx) file to import.", Assert.Throws<TransactionImportRejectedException>(() => reader.ValidateFileName(fileName)).Message);

    [Fact]
    public async Task InspectionAndExplicitProfile_KeepTheSameColumnsPreviewAndSignConvention()
    {
        const string csv = "When,Vendor,Value\n2026-07-20,Purchase,-12.3456\n";
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(csv));
        var inspection = await reader.InspectAsync(stream, "custom.csv", default);
        Assert.Equal(["When", "Vendor", "Value"], inspection.Headers);
        Assert.Equal(["2026-07-20", "Purchase", "-12.3456"], Assert.Single(inspection.PreviewRows));
        Assert.Equal("New CSV profile", inspection.SuggestedProfile!.Name);
        stream.Position = 0;
        var profile = Profile(inspection.Headers, "When", "Vendor", "Value", ImportAmountConvention.MoneyInPositive);
        var result = await reader.ReadAsync(stream, "custom.csv", profile, default);
        Assert.Equal(inspection.FileSizeBytes, result.FileSizeBytes);
        Assert.Equal(inspection.Sha256Hash, result.Sha256Hash);
        Assert.Equal(12.3456m, Assert.Single(result.Rows).Amount);
        stream.Position = 0;
        var wrong = await Assert.ThrowsAsync<TransactionImportRejectedException>(() => reader.ReadAsync(stream,
            "custom.csv", Profile(["Date", "Description", "Amount"]), default));
        Assert.Equal("This file does not match the selected profile 'Test profile'.", wrong.Message);
    }

    [Fact]
    public async Task DebitCreditAndAmountParsing_RetainRefundAndInvalidRowMeanings()
    {
        var result = await Read("Date,Description,Debit,Credit\n2026-07-20,Purchase,55.10,\n2026-07-21,Refund,,12.25\n2026-07-22,Invalid,1,2\n");
        Assert.Equal(55.10m, result.Rows[0].Amount); Assert.Equal(-12.25m, result.Rows[1].Amount);
        Assert.Null(result.Rows[2].Amount);
        Assert.Equal("A row cannot contain both a debit and a credit amount.", result.Rows[2].ValidationMessage);
        var invalid = Assert.Single((await Read("Date,Description,Amount\nbad-date,Purchase,bad-amount\n")).Rows);
        Assert.Null(invalid.TransactionDate); Assert.Null(invalid.Amount);
        Assert.Equal("Amount 'bad-amount' could not be parsed. Date 'bad-date' could not be parsed.", invalid.ValidationMessage);
        var formatted = Assert.Single((await Read("Date,Description,Amount\n07/21/2026,Refund,\"CAD (1,250.1234)\"\n")).Rows);
        Assert.Equal(new DateOnly(2026, 7, 21), formatted.TransactionDate);
        Assert.Equal(-1250.1234m, formatted.Amount);
    }

    [Theory]
    [InlineData("Date, date ,Amount\n", "CSV column names must be unique.")]
    [InlineData("Date,,Amount\n", "CSV column names cannot be empty.")]
    [InlineData("\n", "The CSV file must contain a header row.")]
    [InlineData("Date,Description,Amount\n2026-07-20,Purchase\n", "CSV row 2 contains 2 fields; the header defines 3.")]
    [InlineData("Date,Description,Amount\n", "The CSV file does not contain any transaction rows.")]
    public async Task CsvStructuralFailures_KeepExistingMessages(string csv, string message) =>
        Assert.Equal(message, (await Assert.ThrowsAsync<TransactionImportRejectedException>(() => Read(csv))).Message);

    [Fact]
    public async Task InvalidUtf8_AndOversizeFileAndRow_FailSafely()
    {
        using var invalid = new MemoryStream([0xc3, 0x28]); // Invalid UTF-8, not a valid encoding-detection BOM.
        Assert.Equal("The CSV file is not valid UTF-8 text.", (await Assert.ThrowsAsync<TransactionImportRejectedException>(() => reader.ReadAsync(invalid, "bank.csv", default))).Message);
        using var oversized = new MemoryStream(new byte[TransactionImportLimits.MaxFileSizeBytes + 1]);
        Assert.Equal("CSV files cannot exceed 10 MB.", (await Assert.ThrowsAsync<TransactionImportRejectedException>(() => reader.ReadAsync(oversized, "bank.csv", default))).Message);
        var longRow = "Date,Description,Amount\n2026-07-20," + new string('x', ImportTransactionDraft.RawDataMaxLength) + ",10\n";
        Assert.Equal("A CSV row is too large to stage safely.", (await Assert.ThrowsAsync<TransactionImportRejectedException>(() => Read(longRow))).Message);
    }

    [Fact]
    public async Task ExistingBomDetection_RemainsUnchanged()
    {
        const string csv = "Date,Description,Amount\n2026-07-20,Purchase,10\n";
        foreach (var encoding in new Encoding[] { new UTF8Encoding(true), Encoding.Unicode })
        {
            var bytes = encoding.GetPreamble().Concat(encoding.GetBytes(csv)).ToArray();
            using var stream = new MemoryStream(bytes);
            var result = await reader.ReadAsync(stream, "bank.csv", default);
            Assert.Equal(10m, Assert.Single(result.Rows).Amount);
            Assert.Equal(Convert.ToHexString(SHA256.HashData(bytes)), result.Sha256Hash);
        }
    }

    [Fact]
    public async Task RowLimitAndInspectionPreviewRemainBounded()
    {
        var csv = "Date,Description,Amount\n" + string.Concat(Enumerable.Repeat("2026-07-20,Synthetic,0.0001\n", TransactionImportLimits.MaxRows));
        var result = await Read(csv);
        Assert.Equal(10_000, result.Rows.Count);
        Assert.Equal(0.0001m, result.Rows[^1].Amount);
        using var preview = new MemoryStream(Encoding.UTF8.GetBytes(csv));
        Assert.Equal(5, (await reader.InspectAsync(preview, "large.csv", default)).PreviewRows.Count);
        Assert.Contains("10,000 rows", (await Assert.ThrowsAsync<TransactionImportRejectedException>(() => Read(csv + "2026-07-20,Extra,1\n"))).Message);
    }

    [Fact]
    public async Task CancellationPropagatesWithoutTakingStreamOwnership()
    {
        using var cancellation = new CancellationTokenSource(); cancellation.Cancel();
        using var stream = new MemoryStream(Encoding.UTF8.GetBytes("Date,Description,Amount\n2026-07-20,Purchase,10\n"));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => reader.ReadAsync(stream, "bank.csv", cancellation.Token));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => reader.InspectAsync(stream, "bank.csv", cancellation.Token));
        Assert.True(stream.CanRead); Assert.Equal(0, stream.Position);
    }

    private Task<TransactionImportReadResult> Read(string csv) =>
        reader.ReadAsync(new MemoryStream(Encoding.UTF8.GetBytes(csv)), "bank.csv", default);

    private static ImportProfileDefinition Profile(IReadOnlyList<string> headers,
        string date = "Date", string description = "Description", string amount = "Amount",
        ImportAmountConvention convention = ImportAmountConvention.SpendingPositive) =>
        new(null, "Test profile", headers, date, description, amount, null, null, null, null, convention);
}
