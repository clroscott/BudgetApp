using System.IO.Compression;
using System.Text;
using System.Xml.Linq;

namespace BudgetApp.Tests.Infrastructure.Imports;

// Synthetic, disposable workbooks only; no Excel installation or user files.
internal static class XlsxTestWorkbook
{
    internal const string Namespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    private static readonly XNamespace Ns = Namespace;
    private static readonly XNamespace Rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    private static readonly XNamespace PackageRel = "http://schemas.openxmlformats.org/package/2006/relationships";
    internal sealed record Sheet(string Name, IEnumerable<XElement> Rows, string? State = null, bool Merged = false);

    internal static XElement Text(string value) => new(Ns + "c", new XAttribute("t", "inlineStr"),
        new XElement(Ns + "is", new XElement(Ns + "t", new XAttribute(XNamespace.Xml + "space", "preserve"), value)));
    internal static XElement Number(string value, int? style = null) => new(Ns + "c",
        style is null ? null : new XAttribute("s", style), new XElement(Ns + "v", value));
    internal static XElement Formula(string? cached, string type = "n") => new(Ns + "c", new XAttribute("t", type),
        new XElement(Ns + "f", "EXTERNAL_FUNCTION()"), cached is null ? null : new XElement(Ns + "v", cached));
    internal static XElement Row(int number, params XElement[] cells) => new(Ns + "row", new XAttribute("r", number), cells);
    internal static IEnumerable<XElement> StandardRows(string description = "0012 Synthetic purchase", string amount = "12.3456", int firstRow = 1) => [
        Row(firstRow, Text("Date"), Text("Description"), Text("Amount")),
        Row(firstRow + 1, Text("2026-07-20"), Text(description), Number(amount)),
    ];
    internal static byte[] Create(params Sheet[] sheets) => Create(sheets, false);
    internal static byte[] Create(IReadOnlyList<Sheet> sheets, bool date1904,
        string? sharedStrings = null, string? styles = null, Action<Dictionary<string, string>>? mutate = null)
    {
        var parts = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["[Content_Types].xml"] = "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\" /></Types>",
            ["_rels/.rels"] = new XElement(PackageRel + "Relationships", Relationship("office", "officeDocument", "xl/workbook.xml")).ToString(),
            ["xl/workbook.xml"] = new XElement(Ns + "workbook", new XElement(Ns + "workbookPr", new XAttribute("date1904", date1904 ? "1" : "0")),
                new XElement(Ns + "sheets", sheets.Select((sheet, i) => new XElement(Ns + "sheet",
                    new XAttribute("name", sheet.Name), new XAttribute("sheetId", i + 1), new XAttribute(Rel + "id", "sheet" + (i + 1)),
                    sheet.State is null ? null : new XAttribute("state", sheet.State))))).ToString(),
            ["xl/_rels/workbook.xml.rels"] = new XElement(PackageRel + "Relationships",
                sheets.Select((_, i) => Relationship("sheet" + (i + 1), "worksheet", "/xl/worksheets/sheet" + (i + 1) + ".xml")),
                sharedStrings is null ? null : Relationship("shared", "sharedStrings", "sharedStrings.xml"),
                styles is null ? null : Relationship("styles", "styles", "styles.xml")).ToString(),
        };
        for (var i = 0; i < sheets.Count; i++)
            parts[$"xl/worksheets/sheet{i + 1}.xml"] = new XElement(Ns + "worksheet", new XElement(Ns + "sheetData", sheets[i].Rows),
                sheets[i].Merged ? new XElement(Ns + "mergeCells", new XElement(Ns + "mergeCell", new XAttribute("ref", "A1:C1"))) : null).ToString();
        if (sharedStrings is not null) parts["xl/sharedStrings.xml"] = sharedStrings;
        if (styles is not null) parts["xl/styles.xml"] = styles;
        mutate?.Invoke(parts);
        return Zip(parts);
    }
    internal static byte[] Zip(IReadOnlyDictionary<string, string> parts)
    {
        using var output = new MemoryStream();
        using (var archive = new ZipArchive(output, ZipArchiveMode.Create, true))
            foreach (var (path, xml) in parts)
            {
                using var writer = new StreamWriter(archive.CreateEntry(path).Open(), new UTF8Encoding(false));
                writer.Write(xml);
            }
        return output.ToArray();
    }
    private static XElement Relationship(string id, string type, string target) => new(PackageRel + "Relationship",
        new XAttribute("Id", id), new XAttribute("Type", Rel.NamespaceName + "/" + type), new XAttribute("Target", target));
    internal static string DateStyles => $"<styleSheet xmlns=\"{Namespace}\"><cellXfs><xf numFmtId=\"0\"/><xf numFmtId=\"14\"/></cellXfs></styleSheet>";
}
