using System.Security.Cryptography;
using System.Text.Json;
using System.Xml.Linq;
using BudgetApp.Application.Imports;
using BudgetApp.Domain.Imports;
using BudgetApp.Infrastructure.Imports;
using static BudgetApp.Tests.Infrastructure.Imports.XlsxTestWorkbook;

namespace BudgetApp.Tests.Infrastructure.Imports;

public sealed class XlsxImportReaderTests
{
    private readonly ITransactionImportReader reader = new TransactionImportReader(new CsvImportReader(), new XlsxImportReader());
    private static readonly XNamespace Ns = Namespace;

    [Fact]
    public async Task SingleVisibleSheet_AutoSelectsAndPreservesRealRowsHashExactAmountsAndRawData()
    {
        var bytes = Create(new Sheet("Chequing", StandardRows(amount: "-12.3456", firstRow: 7)), new Sheet("Blank", []));
        using var stream = new MemoryStream(bytes);
        var preview = await reader.InspectAsync(stream, "BANK.XLSX", default);
        Assert.Equal("1", preview.SelectedWorksheetId); Assert.Equal("Chequing", preview.SelectedWorksheetName);
        Assert.Equal([8], preview.PreviewRowNumbers); Assert.Equal("Blank worksheet.", preview.Worksheets![1].Problem);
        stream.Position = 0;
        var result = await reader.ReadAsync(stream, "BANK.XLSX", default);
        var row = Assert.Single(result.Rows);
        Assert.Equal(8, row.SourceRowNumber); Assert.Equal(new DateOnly(2026, 7, 20), row.TransactionDate);
        Assert.Equal(-12.3456m, row.Amount); Assert.Equal("0012 Synthetic purchase", row.Description);
        Assert.Null(row.ValidationMessage); Assert.Equal("Chequing", result.SourceWorksheetName);
        Assert.Equal(Convert.ToHexString(SHA256.HashData(bytes)), result.Sha256Hash);
        Assert.Equal(bytes.Length, result.FileSizeBytes); Assert.True(stream.CanRead);
        Assert.Equal("-12.3456", JsonSerializer.Deserialize<Dictionary<string, string>>(row.RawData)!["Amount"]);
    }

    [Fact]
    public async Task MultipleAndHiddenSheets_RequireExplicitSelectionAndNeverMerge()
    {
        var bytes = Create(new Sheet("First", StandardRows("First")), new Sheet("Second", StandardRows("Second")), new Sheet("Hidden", StandardRows("Hidden"), "veryHidden"));
        var preview = await Inspect(bytes);
        Assert.Null(preview.SelectedWorksheetId); Assert.Empty(preview.Headers); Assert.Null(preview.SuggestedProfile);
        Assert.True(preview.Worksheets![2].IsHidden);
        Assert.Contains("Choose a worksheet", (await RejectRead(bytes)).Message);
        Assert.Equal("Second", Assert.Single((await Read(bytes, "2")).Rows).Description);
        Assert.Equal("Hidden", Assert.Single((await Read(bytes, "3")).Rows).Description);
        Assert.Contains("does not exist", (await RejectRead(bytes, "999")).Message);
        var hiddenOnly = Create(new Sheet("Hidden", StandardRows(), "hidden"));
        Assert.Null((await Inspect(hiddenOnly)).SelectedWorksheetId);
        Assert.Contains("Choose a worksheet", (await RejectRead(hiddenOnly)).Message);
    }

    [Theory]
    [InlineData(false, "46223.5", 2026, 7, 20)]
    [InlineData(true, "44761.5", 2026, 7, 20)]
    [InlineData(false, "1", 1900, 1, 1)]
    [InlineData(false, "59", 1900, 2, 28)]
    [InlineData(false, "61", 1900, 3, 1)]
    [InlineData(true, "0", 1904, 1, 1)]
    public async Task NativeExcelDates_UseTheWorkbookDateSystem(bool date1904, string serial, int year, int month, int day)
    {
        var bytes = Create([new Sheet("Dates", [Row(1, Text("Date"), Text("Description"), Text("Amount")), Row(3, Number(serial, 1), Text("Purchase"), Number("1E-4"))])], date1904, styles: DateStyles);
        var row = Assert.Single((await Read(bytes)).Rows);
        Assert.Equal(new DateOnly(year, month, day), row.TransactionDate); Assert.Equal(0.0001m, row.Amount); Assert.Null(row.ValidationMessage);
    }

    [Fact]
    public async Task InvalidSerialAndExplicitIsoDate_AreHandledWithoutInventingDates()
    {
        var bytes = Create([new Sheet("Dates", [Row(1, Text("Date"), Text("Description"), Text("Amount")),
            Row(2, Number("60", 1), Text("Invalid leap day"), Number("1")),
            Row(5, new XElement(Ns + "c", new XAttribute("t", "d"), new XElement(Ns + "v", "2026-07-20T12:30:00Z")), Text("ISO"), Number("-2"))])], false, styles: DateStyles);
        var rows = (await Read(bytes)).Rows;
        Assert.Contains("Invalid Excel serial date", rows[0].ValidationMessage); Assert.Null(rows[0].TransactionDate);
        Assert.Equal(new DateOnly(2026, 7, 20), rows[1].TransactionDate); Assert.Null(rows[1].ValidationMessage);
    }

    [Theory]
    [InlineData(18)]
    [InlineData(21)]
    [InlineData(32)]
    [InlineData(45)]
    [InlineData(46)]
    public async Task TimeOnlyStyles_DoNotInventCalendarDates(int format)
    {
        var styles = $"<styleSheet xmlns=\"{Namespace}\"><cellXfs><xf numFmtId=\"{format}\"/></cellXfs></styleSheet>";
        var bytes = Create([new Sheet("Time", [Row(1, Text("Date"), Text("Description"), Text("Amount")), Row(2, Number("46223.5", 0), Text("Time"), Number("1"))])], false, styles: styles);
        var row = Assert.Single((await Read(bytes)).Rows);
        Assert.Null(row.TransactionDate); Assert.Contains("could not be parsed", row.ValidationMessage);
    }

    [Fact]
    public async Task LocaleAmbiguousStyle_IsCorrectableInsteadOfGuessingTheDate()
    {
        var styles = $"<styleSheet xmlns=\"{Namespace}\"><cellXfs><xf numFmtId=\"55\"/></cellXfs></styleSheet>";
        var bytes = Create([new Sheet("Ambiguous", [Row(1, Text("Date"), Text("Description"), Text("Amount")), Row(2, Number("46223.5", 0), Text("Date"), Number("1"))])], false, styles: styles);
        Assert.Contains("Locale-dependent Excel", Assert.Single((await Read(bytes)).Rows).ValidationMessage);
    }

    [Fact]
    public async Task SavedFormulaResults_AreReadMissingAndErrorResultsBecomeCorrectableDrafts()
    {
        var bytes = Create(new Sheet("Formula", [Row(1, Text("Date"), Text("Description"), Text("Amount"), Text("Ignored")),
            Row(2, Text("2026-07-20"), Formula("0012 merchant", "str"), Formula("-12.3456"), Formula(null)),
            Row(3, Text("2026-07-20"), Text("Missing cache"), Formula(null)),
            Row(4, Text("2026-07-20"), Text("Error"), Formula("#REF!", "e"))]));
        var profile = Profile(["Date", "Description", "Amount", "Ignored"]);
        var rows = (await Read(bytes, profile: profile)).Rows;
        Assert.Null(rows[0].ValidationMessage); Assert.Equal(-12.3456m, rows[0].Amount); Assert.Equal("0012 merchant", rows[0].Description);
        Assert.Null(rows[1].Amount); Assert.Contains("Worksheet 'Formula', row 3", rows[1].ValidationMessage);
        Assert.Contains("no usable saved result", rows[1].ValidationMessage); Assert.Contains("Excel error #REF!", rows[2].ValidationMessage);
    }

    [Fact]
    public async Task SharedRichStringsAndInlineText_PreserveLeadingZerosAndIgnorePhonetics()
    {
        var shared = $"<sst xmlns=\"{Namespace}\"><si><r><t>0012 </t></r><r><t>Market</t></r><rPh><t>phonetic</t></rPh></si></sst>";
        var bytes = Create([new Sheet("Text", [Row(1, Text("Date"), Text("Description"), Text("Amount")),
            Row(2, Text("2026-07-20"), new XElement(Ns + "c", new XAttribute("t", "s"), new XElement(Ns + "v", "0")), Number("25.0001"))])], false, sharedStrings: shared);
        var row = Assert.Single((await Read(bytes)).Rows);
        Assert.Equal("0012 Market", row.Description); Assert.Null(row.ValidationMessage);
    }

    [Fact]
    public async Task SpreadsheetTextEscapes_AreDecodedOnce()
    {
        var bytes = Create(new Sheet("Text", StandardRows("0012_x0020_Market _x005F_x0041_")));
        Assert.Equal("0012 Market _x0041_", Assert.Single((await Read(bytes)).Rows).Description);
    }

    [Theory]
    [InlineData("fr-CA", "1 234,5678")]
    [InlineData("de-DE", "1.234,5678")]
    [InlineData("en-CA", "1,234.5678")]
    public async Task ExplicitTextNumberFormats_PreserveExactSignedAmounts(string culture, string text)
    {
        var bytes = Create(new Sheet("Text", [Row(1, Text("Date"), Text("Description"), Text("Amount")),
            Row(2, Text("2026-07-20"), Text("Refund"), Text("(" + text + ")"))]));
        var row = Assert.Single((await Read(bytes, profile: Profile(["Date", "Description", "Amount"]) with { NumberCulture = culture })).Rows);
        Assert.Equal(-1234.5678m, row.Amount); Assert.Null(row.ValidationMessage);
    }

    [Fact]
    public async Task LocalizedTextMappingAndNativeValues_UseOneProfileWithoutChangingCsvDefaults()
    {
        var profile = Profile(["When", "Vendor", "Value"], "When", "Vendor", "Value") with { DateFormat = "dd/MM/yyyy", NumberCulture = "de-DE", AmountConvention = ImportAmountConvention.MoneyInPositive };
        var bytes = Create([new Sheet("Localized", [Row(1, Text("When"), Text("Vendor"), Text("Value")),
            Row(2, Text("20/07/2026"), Text("Text refund"), Text("1.234,5678")),
            Row(3, Number("46223", 1), Text("Native refund"), Number("12.3456"))])], false, styles: DateStyles);
        var rows = (await Read(bytes, profile: profile)).Rows;
        Assert.Equal(-1234.5678m, rows[0].Amount); Assert.Equal(-12.3456m, rows[1].Amount);
        Assert.All(rows, row => { Assert.Equal(new DateOnly(2026, 7, 20), row.TransactionDate); Assert.Null(row.ValidationMessage); });
        using var csv = new MemoryStream(System.Text.Encoding.UTF8.GetBytes("When,Vendor,Value\n20/07/2026,Text refund,\"1.234,5678\"\n"));
        Assert.Equal(rows[0].Amount, Assert.Single((await reader.ReadAsync(csv, "bank.csv", profile, default)).Rows).Amount);
        await Assert.ThrowsAsync<TransactionImportRejectedException>(() => Read(bytes, profile: profile with { NumberCulture = "invalid" }));
    }

    [Fact]
    public async Task DebitCreditCategoryAndSparseBlankRows_KeepExistingImportMeanings()
    {
        var bytes = Create(new Sheet("Purchases", [Row(2, Text("Date"), Text("Description"), Text("Debit"), Text("Credit"), Text("Category"), Text("Subcategory")),
            Row(7, Text("2026-07-20"), Text("Food purchase"), Number("10"), Text(""), Text("Food"), Text("Groceries")),
            Row(8), Row(12, Text("2026-07-21"), Text("Refund"), Text(""), Number("5.0001"))]));
        var rows = (await Read(bytes)).Rows;
        Assert.Equal(2, rows.Count); Assert.Equal(7, rows[0].SourceRowNumber); Assert.Equal("Groceries", rows[0].SubcategoryName);
        Assert.Equal(10m, rows[0].Amount); Assert.Equal(-5.0001m, rows[1].Amount); Assert.Equal(12, rows[1].SourceRowNumber);
    }

    [Theory]
    [InlineData("duplicate", "unique")]
    [InlineData("missing", "empty")]
    [InlineData("blank", "Blank worksheet")]
    [InlineData("headerOnly", "No transaction rows")]
    [InlineData("merged", "Merged cells")]
    [InlineData("wider", "beyond its header")]
    [InlineData("rowOrder", "out-of-order row")]
    [InlineData("cellOrder", "out-of-order cells")]
    public async Task UnsupportedLayouts_HaveUnderstandableFailures(string kind, string message)
    {
        IEnumerable<XElement> rows = kind switch {
            "duplicate" => [Row(1, Text("Date"), Text(" date "), Text("Amount")), Row(2, Text("x"))],
            "missing" => [Row(1, Text("Date"), Text(""), Text("Amount")), Row(2, Text("x"))],
            "blank" => [], "headerOnly" => [Row(1, Text("Date"), Text("Description"), Text("Amount"))],
            "wider" => [Row(1, Text("Date"), Text("Description"), Text("Amount")), Row(2, Text("x"), Text("y"), Number("1"), Text("extra"))],
            "rowOrder" => [Row(2, Text("Date")), Row(1, Text("x"))],
            "cellOrder" => [Row(1, new XElement(Ns + "c", new XAttribute("r", "B1"), new XElement(Ns + "v", "1")), new XElement(Ns + "c", new XAttribute("r", "A1"), new XElement(Ns + "v", "2")))],
            _ => StandardRows(),
        };
        Assert.Contains(message, (await RejectRead(Create(new Sheet("Invalid", rows, Merged: kind == "merged")))).Message);
    }

    [Fact]
    public async Task UnknownHeaders_CanBeInspectedAndMappedButNotSilentlyImported()
    {
        var bytes = Create(new Sheet("Custom", [Row(1, Text("When"), Text("Vendor"), Text("Value")), Row(2, Text("2026-07-20"), Text("Purchase"), Number("10"))]));
        Assert.NotNull((await Inspect(bytes)).SuggestedProfile);
        await Assert.ThrowsAsync<TransactionImportRejectedException>(() => Read(bytes));
        Assert.Equal(10m, Assert.Single((await Read(bytes, profile: Profile(["When", "Vendor", "Value"], "When", "Vendor", "Value"))).Rows).Amount);
    }

    [Theory]
    [InlineData("notZip")]
    [InlineData("encrypted")]
    [InlineData("macro")]
    [InlineData("doctype")]
    [InlineData("badXml")]
    [InlineData("unsafePath")]
    [InlineData("tooManyParts")]
    [InlineData("oversizePart")]
    [InlineData("oversizeCell")]
    [InlineData("tooManySheets")]
    public async Task MalformedAndResourceHeavyPackages_AreRejectedSafely(string kind)
    {
        var bytes = kind switch {
            "notZip" => new byte[] { 1, 2, 3 }, "encrypted" => new byte[] { 0xd0, 0xcf, 0x11, 0xe0, 1 },
            "tooManySheets" => Create(Enumerable.Range(0, 21).Select(i => new Sheet("Sheet" + i, StandardRows())).ToArray()),
            "oversizeCell" => Create(new Sheet("Large", StandardRows(new string('x', 4097)))),
            _ => Create([new Sheet("Data", StandardRows())], false, mutate: parts => {
                if (kind == "macro") parts["xl/vbaProject.bin"] = "macro";
                if (kind == "doctype") parts["xl/workbook.xml"] = "<!DOCTYPE workbook [<!ENTITY x SYSTEM 'file:///not-readable'>]>" + parts["xl/workbook.xml"];
                if (kind == "badXml") parts["xl/worksheets/sheet1.xml"] = "<unclosed";
                if (kind == "unsafePath") parts["../outside.xml"] = "bad";
                if (kind == "tooManyParts") for (var i = 0; i < 513; i++) parts[$"extra/{i}.xml"] = "";
                if (kind == "oversizePart") parts["huge.bin"] = new string('x', checked((int)XlsxImportLimits.MaxPartBytes + 1));
            }),
        };
        await Assert.ThrowsAsync<TransactionImportRejectedException>(() => Inspect(bytes));
        await RejectRead(bytes);
    }

    [Fact]
    public async Task ExternalLinks_AreNotFetchedAndOnlySavedValuesAreRead()
    {
        var bytes = Create([new Sheet("Data", StandardRows())], false, mutate: parts => {
            parts["xl/_rels/workbook.xml.rels"] = parts["xl/_rels/workbook.xml.rels"].Replace("</Relationships>", "<Relationship Id=\"external\" Type=\"externalLink\" TargetMode=\"External\" Target=\"https://not-readable.invalid/workbook.xlsx\"/></Relationships>");
        });
        Assert.Null(Assert.Single((await Read(bytes)).Rows).ValidationMessage);
    }

    [Fact]
    public async Task CompressedAndTotalExpandedLimits_AreEnforcedBeforeParsing()
    {
        await RejectRead(new byte[TransactionImportLimits.MaxFileSizeBytes + 1]);
        var bytes = Create([new Sheet("Data", StandardRows())], false, mutate: parts => {
            var padding = new string('x', 26 * 1024 * 1024);
            for (var i = 0; i < 4; i++) parts[$"padding/{i}.bin"] = padding;
        });
        Assert.Contains("expanded-data limit", (await RejectRead(bytes)).Message);
    }

    [Theory]
    [InlineData("columns", "100 columns")]
    [InlineData("sharedCount", "shared text")]
    [InlineData("sharedLength", "shared text")]
    [InlineData("styles", "Too many Excel cell styles")]
    [InlineData("physicalRows", "physical rows")]
    [InlineData("metadata", "metadata")]
    public async Task WorksheetAndMetadataLimits_HaveExplicitFailures(string kind, string message)
    {
        var rows = kind == "columns" ? new[] { Row(1, Enumerable.Repeat("Header", 101).Select(Text).ToArray()) } :
            kind == "physicalRows" ? Enumerable.Range(1, 20_001).Select(i => Row(i)).ToArray() : StandardRows();
        var shared = kind == "sharedCount" ? $"<sst xmlns=\"{Namespace}\">" + string.Concat(Enumerable.Repeat("<si><t>x</t></si>", 100_001)) + "</sst>" :
            kind == "sharedLength" ? $"<sst xmlns=\"{Namespace}\">" + string.Concat(Enumerable.Repeat("<si><t>" + new string('x', 4000) + "</t></si>", 501)) + "</sst>" : null;
        var styles = kind == "styles" ? $"<styleSheet xmlns=\"{Namespace}\"><cellXfs>" + string.Concat(Enumerable.Repeat("<xf numFmtId=\"0\"/>", 4097)) + "</cellXfs></styleSheet>" : null;
        var bytes = Create([new Sheet("Data", rows)], false, shared, styles, parts => {
            if (kind == "metadata") parts["[Content_Types].xml"] = new string('x', 1_048_577);
        });
        Assert.Contains(message, (await RejectRead(bytes)).Message);
    }

    [Fact]
    public async Task LargeDisposableWorkbook_IsBoundedAndPreviewDoesNotRetainEveryRow()
    {
        var rows = new[] { Row(1, Text("Date"), Text("Description"), Text("Amount")) }.Concat(
            Enumerable.Range(2, 10_000).Select(i => Row(i, Text("2026-07-20"), Text("Synthetic " + i), Number("0.0001"))));
        var bytes = Create(new Sheet("Large", rows));
        var preview = await Inspect(bytes);
        Assert.Equal(5, preview.PreviewRows.Count); Assert.Equal(10_000, Assert.Single(preview.Worksheets!).TransactionRows);
        var result = await Read(bytes); Assert.Equal(10_000, result.Rows.Count); Assert.Equal(10_001, result.Rows[^1].SourceRowNumber);
        var extra = Create(new Sheet("Too large", rows.Append(Row(10_002, Text("2026-07-20"), Text("Extra"), Number("1")))));
        Assert.Contains("10,000 transaction rows", (await RejectRead(extra)).Message);
    }

    [Fact]
    public async Task CancellationPropagatesAndCsvRejectsWorksheetSelection()
    {
        using var ct = new CancellationTokenSource(); ct.Cancel();
        using var stream = new MemoryStream(Create(new Sheet("Data", StandardRows())));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => reader.ReadAsync(stream, "bank.xlsx", ct.Token));
        Assert.True(stream.CanRead);
        using var csv = new MemoryStream();
        await Assert.ThrowsAsync<TransactionImportRejectedException>(() => reader.InspectAsync(csv, "bank.csv", default, "1"));
    }

    private Task<TransactionImportInspection> Inspect(byte[] bytes) => reader.InspectAsync(new MemoryStream(bytes), "test.xlsx", default);
    private Task<TransactionImportReadResult> Read(byte[] bytes, string? id = null, ImportProfileDefinition? profile = null) =>
        profile is null ? reader.ReadAsync(new MemoryStream(bytes), "test.xlsx", default, id) : reader.ReadAsync(new MemoryStream(bytes), "test.xlsx", profile, default, id);
    private Task<TransactionImportRejectedException> RejectRead(byte[] bytes, string? id = null) => Assert.ThrowsAsync<TransactionImportRejectedException>(() => Read(bytes, id));
    private static ImportProfileDefinition Profile(IReadOnlyList<string> headers, string date = "Date", string description = "Description", string amount = "Amount") =>
        new(null, "Test", headers, date, description, amount, null, null, null, null, ImportAmountConvention.SpendingPositive);
}
