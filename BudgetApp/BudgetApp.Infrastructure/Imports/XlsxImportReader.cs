using System.Globalization;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;
using BudgetApp.Application.Imports;
using BudgetApp.Domain.Imports;
using static BudgetApp.Infrastructure.Imports.TransactionImportRowParser;

namespace BudgetApp.Infrastructure.Imports;

// A deliberately limited tabular SpreadsheetML reader. ZIP parts are never
// extracted, relationships are never fetched, and formulas are never evaluated.
public sealed class XlsxImportReader
{
    public Task<TransactionImportInspection> InspectAsync(Stream content, string? worksheetId, CancellationToken ct) =>
        Open(content, ct, workbook => workbook.Inspect(worksheetId));

    public Task<TransactionImportReadResult> ReadAsync(Stream content, ImportProfileDefinition? profile, string? worksheetId, CancellationToken ct) =>
        Open(content, ct, workbook => workbook.Read(profile, worksheetId));

    private static async Task<T> Open<T>(Stream content, CancellationToken ct, Func<Workbook, T> read)
    {
        ArgumentNullException.ThrowIfNull(content);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(XlsxImportLimits.MaxReadSeconds));
        try
        {
            using var buffer = new MemoryStream();
            var chunk = new byte[81920];
            int count;
            while ((count = await content.ReadAsync(chunk, timeout.Token)) != 0)
            {
                if (buffer.Length + count > TransactionImportLimits.MaxFileSizeBytes)
                    throw Reject("Excel files cannot exceed 10 MB.");
                await buffer.WriteAsync(chunk.AsMemory(0, count), timeout.Token);
            }
            var bytes = buffer.ToArray();
            if (bytes.AsSpan().StartsWith(new byte[] { 0xd0, 0xcf, 0x11, 0xe0 }))
                throw Reject("Encrypted/password-protected or legacy Excel workbooks are not supported. Save an unencrypted .xlsx copy.");
            if (bytes.Length == 0) throw Reject("The selected Excel workbook is empty.");
            using var workbook = new Workbook(bytes, timeout.Token);
            return read(workbook);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        { throw Reject("The Excel workbook took too long to read. Use a smaller, simpler workbook."); }
        catch (Exception ex) when (ex is InvalidDataException or XmlException or NotSupportedException or OverflowException or FormatException or ArgumentException or InvalidOperationException or RegexMatchTimeoutException)
        { throw Reject("The Excel workbook is invalid, encrypted or uses an unsupported layout. Save an unencrypted .xlsx copy with one header row and transaction rows."); }
    }

    private static TransactionImportRejectedException Reject(string message) => new(message);

    private sealed class Workbook : IDisposable
    {
        private const string SpreadsheetNs = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
        private const string StrictNs = "http://purl.oclc.org/ooxml/spreadsheetml/main";
        private readonly ZipArchive archive;
        private readonly Dictionary<string, ZipArchiveEntry> parts;
        private readonly CancellationToken ct;
        private readonly byte[] bytes;
        private readonly List<Sheet> sheets = [];
        private readonly List<string> sharedStrings = [];
        private readonly List<CellStyle> cellStyles = [];
        private bool date1904;
        private int cellsRead;
        private XNamespace ns = SpreadsheetNs;

        public Workbook(byte[] bytes, CancellationToken ct)
        {
            this.bytes = bytes; this.ct = ct;
            archive = new ZipArchive(new MemoryStream(bytes, false), ZipArchiveMode.Read);
            try
            {
                parts = GuardPackage();
                LoadMetadata();
            }
            catch { archive.Dispose(); throw; }
        }

        private Dictionary<string, ZipArchiveEntry> GuardPackage()
        {
            if (archive.Entries.Count > XlsxImportLimits.MaxEntries) throw Reject("Excel workbook contains too many package parts (maximum 512).");
            var result = new Dictionary<string, ZipArchiveEntry>(StringComparer.Ordinal);
            var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            long total = 0;
            var chunk = new byte[81920];
            foreach (var entry in archive.Entries)
            {
                ct.ThrowIfCancellationRequested();
                var name = entry.FullName;
                if (name.StartsWith('/') || name.Contains('\\') || name.Split('/').Any(p => p is ".." or ".") || !names.Add(name))
                    throw Reject("Excel workbook contains unsafe or duplicate package paths.");
                if (name.EndsWith("vbaProject.bin", StringComparison.OrdinalIgnoreCase)) throw Reject("Macro-enabled workbooks are not supported. Save a macro-free .xlsx copy.");
                if (entry.Length > XlsxImportLimits.MaxPartBytes) throw Reject("An expanded Excel part exceeds 32 MB.");
                using var stream = entry.Open();
                long measured = 0; int count;
                // Measure actual expansion, not only the untrusted ZIP directory.
                while ((count = stream.Read(chunk)) != 0)
                {
                    ct.ThrowIfCancellationRequested(); measured += count; total += count;
                    if (measured > XlsxImportLimits.MaxPartBytes || total > XlsxImportLimits.MaxExpandedBytes)
                        throw Reject("Excel workbook exceeds the safe expanded-data limit (32 MB per part, 100 MB total).");
                }
                if (measured != entry.Length) throw Reject("Excel workbook has inconsistent package lengths.");
                result.Add(name, entry);
            }
            return result;
        }

        private XmlReader Xml(string part)
        {
            if (!parts.TryGetValue(part, out var entry)) throw Reject($"Excel workbook is missing required part '{part}'.");
            return XmlReader.Create(entry.Open(), new XmlReaderSettings
            {
                DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null, CloseInput = true,
                MaxCharactersInDocument = XlsxImportLimits.MaxPartBytes, IgnoreComments = true
            });
        }

        private XElement Root(string part)
        {
            if (!parts.TryGetValue(part, out var entry) || entry.Length > XlsxImportLimits.MaxMetadataBytes)
                throw Reject("Excel workbook metadata is missing or exceeds 1 MB.");
            // Metadata is tiny but still untrusted; bound depth before building
            // its tree, as worksheet/cell data is streamed rather than tree-loaded.
            using (var guard = Xml(part))
                while (guard.Read())
                {
                    ct.ThrowIfCancellationRequested();
                    if (guard.Depth > 32) throw Reject("Excel metadata XML is too deeply nested.");
                }
            using var reader = Xml(part);
            return XElement.Load(reader);
        }

        private static string Target(string basePart, string target)
        {
            if (target.Contains('\\') || !target.StartsWith('/') && Uri.TryCreate(target, UriKind.Absolute, out _)) throw Reject("External or invalid workbook relationship is not supported.");
            var uri = new Uri(new Uri("https://workbook.invalid/" + basePart), target);
            if (uri.Host != "workbook.invalid" || uri.Query.Length != 0 || uri.Fragment.Length != 0) throw Reject("Invalid workbook relationship.");
            return Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/'));
        }

        private Dictionary<string, (string Type, string Path)> Relationships(string part, string basePart)
        {
            var result = new Dictionary<string, (string, string)>(StringComparer.Ordinal);
            foreach (var rel in Root(part).Elements().Where(e => e.Name.LocalName == "Relationship"))
            {
                if ((string?)rel.Attribute("TargetMode") == "External") continue;
                var id = (string?)rel.Attribute("Id") ?? throw Reject("A workbook relationship is missing its ID.");
                if (!result.TryAdd(id, ((string?)rel.Attribute("Type") ?? "", Target(basePart, (string?)rel.Attribute("Target") ?? ""))))
                    throw Reject("Duplicate workbook relationship IDs.");
            }
            return result;
        }

        private void LoadMetadata()
        {
            var types = Root("[Content_Types].xml");
            if (types.Descendants().Any(e => ((string?)e.Attribute("ContentType"))?.Contains("macroEnabled", StringComparison.OrdinalIgnoreCase) == true))
                throw Reject("Macro-enabled workbooks are not supported.");
            var office = Relationships("_rels/.rels", "").Values.Where(r => r.Type.EndsWith("/officeDocument", StringComparison.Ordinal)).ToList();
            if (office.Count != 1) throw Reject("The file is not a supported Excel workbook.");
            var path = office[0].Path;
            if (ResolveContentType(types, path) != "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml")
                throw Reject("Only macro-free .xlsx spreadsheet workbooks are supported.");
            var root = Root(path);
            ns = root.Name.Namespace;
            if (root.Name.LocalName != "workbook" || ns != SpreadsheetNs && ns != StrictNs) throw Reject("Unsupported Excel workbook namespace.");
            date1904 = (string?)root.Element(ns + "workbookPr")?.Attribute("date1904") is "1" or "true";
            var slash = path.LastIndexOf('/');
            var relPath = (slash < 0 ? "" : path[..(slash + 1)]) + "_rels/" + path[(slash + 1)..] + ".rels";
            var relationships = Relationships(relPath, path);
            var ids = new HashSet<uint>(); var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var element in root.Element(ns + "sheets")?.Elements(ns + "sheet") ?? [])
            {
                var id = (string?)element.Attribute("sheetId") ?? "";
                var name = (string?)element.Attribute("name") ?? "";
                var relationshipId = element.Attributes().FirstOrDefault(a => a.Name.LocalName == "id")?.Value ?? "";
                if (!uint.TryParse(id, out var numericId) || numericId == 0 || !ids.Add(numericId) || string.IsNullOrWhiteSpace(name) || name.Length > 31 || !names.Add(name))
                    throw Reject("Excel worksheets have invalid or duplicate names/IDs.");
                if (!relationships.TryGetValue(relationshipId, out var rel) || !rel.Type.EndsWith("/worksheet", StringComparison.Ordinal))
                    throw Reject($"'{name}' is not a supported transaction worksheet.");
                sheets.Add(new Sheet(id, name, (string?)element.Attribute("state") is "hidden" or "veryHidden", rel.Path));
            }
            if (sheets.Count is 0 or > XlsxImportLimits.MaxWorksheets) throw Reject("Excel workbooks must have between 1 and 20 worksheets.");
            var shared = relationships.Values.SingleOrDefault(r => r.Type.EndsWith("/sharedStrings", StringComparison.Ordinal));
            if (shared.Path is not null) LoadShared(shared.Path);
            var styles = relationships.Values.SingleOrDefault(r => r.Type.EndsWith("/styles", StringComparison.Ordinal));
            if (styles.Path is not null) LoadStyles(styles.Path);
        }

        private static string? ResolveContentType(XElement types, string path)
        {
            XNamespace contentTypesNs = "http://schemas.openxmlformats.org/package/2006/content-types";
            if (types.Name != contentTypesNs + "Types") throw Reject("Unsupported Excel content-type metadata.");
            // OPC permits either a part-specific Override or an extension Default.
            // An explicit override wins, including an unsupported one: never fall
            // back to a safe default to bypass a disallowed workbook declaration.
            var overrides = types.Elements(contentTypesNs + "Override")
                .Where(element => (string?)element.Attribute("PartName") == "/" + path).Take(2).ToList();
            if (overrides.Count > 1) throw Reject("Duplicate workbook content-type overrides.");
            if (overrides.Count == 1) return (string?)overrides[0].Attribute("ContentType");
            var extension = Path.GetExtension(path).TrimStart('.');
            var defaults = types.Elements(contentTypesNs + "Default")
                .Where(element => string.Equals((string?)element.Attribute("Extension"), extension, StringComparison.OrdinalIgnoreCase)).Take(2).ToList();
            if (defaults.Count > 1) throw Reject("Duplicate workbook content-type defaults.");
            return defaults.Count == 1 ? (string?)defaults[0].Attribute("ContentType") : null;
        }

        private void LoadShared(string path)
        {
            using var reader = Xml(path);
            reader.MoveToContent();
            if (reader.LocalName != "sst" || reader.NamespaceURI != ns.NamespaceName) throw Reject("Unsupported Excel shared-string XML.");
            var characters = 0;
            while (reader.Read())
            {
                ct.ThrowIfCancellationRequested();
                if (reader.NodeType != XmlNodeType.Element || reader.LocalName != "si" || reader.NamespaceURI != ns.NamespaceName) continue;
                using var subtree = reader.ReadSubtree();
                var text = ReadCellContent(subtree).Inline; characters += text.Length;
                if (sharedStrings.Count >= XlsxImportLimits.MaxSharedStrings || characters > XlsxImportLimits.MaxSharedStringCharacters)
                    throw Reject("Excel shared text exceeds its safe count/length limit.");
                sharedStrings.Add(DecodeText(text));
            }
        }

        private (string? Value, string Inline, bool Formula) ReadCellContent(XmlReader reader)
        {
            var value = new StringBuilder(); var text = new StringBuilder();
            var nodes = 0; var characters = 0; var valueDepth = -1; var textDepth = -1; var phoneticDepth = -1; var formula = false; var hasValue = false;
            while (reader.Read())
            {
                ct.ThrowIfCancellationRequested();
                if (++nodes > 512 || reader.Depth > 16) throw Reject("An Excel cell/shared string is too complex.");
                if (reader.NodeType == XmlNodeType.Element && reader.NamespaceURI == ns.NamespaceName)
                {
                    if (reader.LocalName == "f") formula = true;
                    if (reader.LocalName == "v") { hasValue = true; valueDepth = reader.IsEmptyElement ? -1 : reader.Depth; }
                    if (reader.LocalName == "rPh") phoneticDepth = reader.IsEmptyElement ? -1 : reader.Depth;
                    if (reader.LocalName == "t" && phoneticDepth < 0) textDepth = reader.IsEmptyElement ? -1 : reader.Depth;
                }
                else if (reader.NodeType == XmlNodeType.EndElement)
                {
                    if (reader.Depth == valueDepth) valueDepth = -1;
                    if (reader.Depth == textDepth) textDepth = -1;
                    if (reader.Depth == phoneticDepth) phoneticDepth = -1;
                }
                else if (reader.NodeType is XmlNodeType.Text or XmlNodeType.CDATA or XmlNodeType.SignificantWhitespace)
                {
                    characters += reader.Value.Length;
                    if (characters > XlsxImportLimits.MaxCellCharacters) throw Reject("An Excel cell exceeds 4,096 characters.");
                    if (valueDepth >= 0) value.Append(reader.Value);
                    if (textDepth >= 0) text.Append(reader.Value);
                }
            }
            return (hasValue ? value.ToString() : null, text.ToString(), formula);
        }

        private void LoadStyles(string path)
        {
            var root = Root(path);
            if (root.Name != ns + "styleSheet") throw Reject("Unsupported Excel style XML.");
            var formats = new Dictionary<uint, string>();
            foreach (var format in root.Element(ns + "numFmts")?.Elements(ns + "numFmt") ?? [])
            {
                if (formats.Count >= XlsxImportLimits.MaxStyles) throw Reject("Too many Excel number styles.");
                formats.Add(uint.Parse((string?)format.Attribute("numFmtId") ?? "0", CultureInfo.InvariantCulture), (string?)format.Attribute("formatCode") ?? "");
            }
            foreach (var style in root.Element(ns + "cellXfs")?.Elements(ns + "xf") ?? [])
            {
                if (cellStyles.Count >= XlsxImportLimits.MaxStyles) throw Reject("Too many Excel cell styles.");
                var id = uint.Parse((string?)style.Attribute("numFmtId") ?? "0", CultureInfo.InvariantCulture);
                var code = formats.GetValueOrDefault(id, "");
                code = Regex.Replace(code, "\"[^\"]*\"|[\\\\_*].|\\[[^\\]]*\\]", "", RegexOptions.CultureInvariant, TimeSpan.FromSeconds(1));
                // Built-in time-only formats are not calendar dates. Some Asian
                // IDs mean a date in one locale and a time in another; without an
                // explicit format code, ask for an unambiguous saved value.
                var dateFormat = Regex.IsMatch(code, "[yd]", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, TimeSpan.FromSeconds(1));
                cellStyles.Add(formats.ContainsKey(id) ? dateFormat ? CellStyle.Date : CellStyle.Number :
                    id is >= 14 and <= 17 or 22 or >= 27 and <= 31 or 36 or 50 or 51 or 54 or 57 or 58 or >= 71 and <= 74 or 77 or 81 ? CellStyle.Date :
                    id is 34 or 35 or 52 or 53 or 55 or 56 ? CellStyle.Ambiguous : CellStyle.Number);
            }
        }

        private Cell Decode(string type, string? styleText, (string? Value, string Inline, bool Formula) content)
        {
            if (++cellsRead > XlsxImportLimits.MaxDecodedCells) throw Reject("Excel workbook exceeds 500,000 decoded cells per read.");
            var raw = content.Value;
            if (raw?.Length > XlsxImportLimits.MaxCellCharacters) throw Reject("An Excel cell exceeds 4,096 characters.");
            var formula = content.Formula;
            if (formula && string.IsNullOrEmpty(raw)) return new("", Error: "Formula has no usable saved result. Recalculate and save the workbook in Excel, or paste values.");
            if (type == "inlineStr") return formula
                ? new("", Error: "Unsupported formula result type. Recalculate and save, or paste values.") : new(DecodeText(content.Inline));
            if (type == "s")
                return int.TryParse(raw, out var index) && index >= 0 && index < sharedStrings.Count
                    ? new(sharedStrings[index]) : new("", Error: "Invalid shared-string reference.");
            if (type == "str") return new(DecodeText(raw ?? ""));
            if (type == "e") return new(raw ?? "", Error: $"Excel error {raw}.");
            if (type == "b") return raw is "0" or "1" ? new(raw == "1" ? "TRUE" : "FALSE") : new("", Error: "Invalid Boolean cell.");
            if (type == "d")
                return DateTimeOffset.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)
                    ? new(raw!, Date: DateOnly.FromDateTime(date.DateTime)) : new(raw ?? "", Error: "Invalid Excel date cell.");
            if (type != "n") return new(raw ?? "", Error: "Unsupported Excel cell type.");
            if (string.IsNullOrEmpty(raw)) return new("");
            if (!decimal.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out var number)) return new(raw, Error: "Invalid or out-of-range numeric cell.");
            if (styleText is not null)
            {
                if (!int.TryParse(styleText, out var style) || style < 0 || style >= cellStyles.Count) return new(raw, Error: "Invalid Excel cell style.");
                if (cellStyles[style] == CellStyle.Ambiguous) return new(raw, Error: "Locale-dependent Excel date/time style. Save the date as yyyy-MM-dd text, or use an explicit date format in Excel.");
                if (cellStyles[style] == CellStyle.Date)
                {
                    var days = decimal.Floor(number);
                    if (!date1904 && (days < 1 || days == 60) || days < 0 || days > 3_000_000) return new(raw, Error: "Invalid Excel serial date.");
                    try
                    {
                        var origin = date1904 ? new DateOnly(1904, 1, 1) : days < 60 ? new DateOnly(1899, 12, 31) : new DateOnly(1899, 12, 30);
                        return new(raw, Date: origin.AddDays((int)days));
                    }
                    catch (ArgumentOutOfRangeException) { return new(raw, Error: "Excel date is out of range."); }
                }
            }
            return new(raw, Number: number);
        }

        // SpreadsheetML escapes use one pass: _x005F_x0041_ is literal _x0041_,
        // not a second escape. This also preserves ordinary leading-zero text.
        private static string DecodeText(string value) => Regex.Replace(value, "_x([0-9a-fA-F]{4})_",
            match => ((char)ushort.Parse(match.Groups[1].Value, NumberStyles.HexNumber, CultureInfo.InvariantCulture)).ToString(),
            RegexOptions.CultureInvariant, TimeSpan.FromSeconds(1));

        private SheetData LoadSheet(Sheet sheet, bool allRows)
        {
            using var reader = Xml(sheet.Path);
            reader.MoveToContent();
            if (reader.LocalName != "worksheet" || reader.NamespaceURI != ns.NamespaceName) throw Reject("Unsupported worksheet XML.");
            var rows = new List<SourceRow>(); string[] headers = []; var total = 0; var physical = 0; var lastRow = 0; var characters = 0;
            var merged = false; var sheetDataDepth = -1;
            while (reader.Read())
            {
                ct.ThrowIfCancellationRequested();
                if (reader.Depth > 32) throw Reject("Excel worksheet XML is too deeply nested.");
                if (reader.NodeType == XmlNodeType.EndElement && reader.Depth == sheetDataDepth) sheetDataDepth = -1;
                if (reader.NodeType != XmlNodeType.Element || reader.NamespaceURI != ns.NamespaceName) continue;
                if (reader.LocalName == "sheetData" && reader.Depth == 1) sheetDataDepth = reader.IsEmptyElement ? -1 : reader.Depth;
                if (reader.LocalName == "mergeCell") { merged = true; continue; }
                if (reader.LocalName != "row") continue;
                if (sheetDataDepth < 0 || reader.Depth != sheetDataDepth + 1) throw Reject("Excel transaction rows must be inside worksheet data.");
                if (++physical > XlsxImportLimits.MaxPhysicalRowsPerSheet) throw Reject("Excel worksheet contains too many physical rows (maximum 20,000).");
                var rowNumber = reader.GetAttribute("r") is { } rowText ? int.Parse(rowText, CultureInfo.InvariantCulture) : lastRow + 1;
                if (rowNumber <= lastRow || rowNumber > 1_048_576) throw Reject("Excel worksheet contains invalid or out-of-order row numbers.");
                lastRow = rowNumber;
                using var subtree = reader.ReadSubtree();
                var cells = new SortedDictionary<int, Cell>(); var lastColumn = -1;
                while (subtree.Read())
                {
                    if (subtree.NodeType != XmlNodeType.Element || subtree.LocalName != "c" || subtree.NamespaceURI != ns.NamespaceName) continue;
                    if (subtree.Depth != 1) throw Reject("Unsupported nested Excel cell layout.");
                    var column = lastColumn + 1;
                    if (subtree.GetAttribute("r") is { } reference)
                    {
                        var match = Regex.Match(reference, "^([A-Za-z]{1,3})([1-9][0-9]{0,6})$", RegexOptions.CultureInvariant, TimeSpan.FromSeconds(1));
                        if (!match.Success || int.Parse(match.Groups[2].Value, CultureInfo.InvariantCulture) != rowNumber) throw Reject("Excel cell reference does not match its row.");
                        column = 0; foreach (var letter in match.Groups[1].Value.ToUpperInvariant()) column = column * 26 + letter - 'A' + 1;
                        column--;
                    }
                    if (column <= lastColumn || column >= XlsxImportLimits.MaxColumns) throw Reject("Excel worksheet has duplicate/out-of-order cells or exceeds 100 columns.");
                    lastColumn = column;
                    var type = subtree.GetAttribute("t") ?? "n"; var style = subtree.GetAttribute("s");
                    using var cellReader = subtree.ReadSubtree();
                    cells.Add(column, Decode(type, style, ReadCellContent(cellReader)));
                }
                if (cells.Values.All(c => string.IsNullOrWhiteSpace(c.Value) && c.Error is null)) continue;
                var width = cells.Last(c => !string.IsNullOrWhiteSpace(c.Value.Value) || c.Value.Error is not null).Key + 1;
                if (headers.Length == 0)
                {
                    headers = Enumerable.Range(0, width).Select(i => cells.GetValueOrDefault(i, new Cell("")).Display()).ToArray();
                    continue;
                }
                if (cells.Any(c => c.Key >= headers.Length && (!string.IsNullOrWhiteSpace(c.Value.Value) || c.Value.Error is not null)))
                    throw Reject($"Worksheet '{sheet.Name}', row {rowNumber} extends beyond its header columns.");
                total++;
                if (total > TransactionImportLimits.MaxRows) throw Reject($"Worksheet '{sheet.Name}' exceeds 10,000 transaction rows.");
                var rowCells = Enumerable.Range(0, headers.Length).Select(i => cells.GetValueOrDefault(i, new Cell(""))).ToArray();
                if (allRows || rows.Count < 5)
                {
                    characters += rowCells.Sum(c => c.Value.Length);
                    if (characters > XlsxImportLimits.MaxSelectedCharacters) throw Reject("Selected Excel data exceeds 5,000,000 characters.");
                    rows.Add(new SourceRow(rowNumber, rowCells));
                }
            }
            string? problem = merged ? "Merged cells are not supported. Use a simple header row and transaction rows." :
                headers.Length == 0 ? "Blank worksheet." : total == 0 ? "No transaction rows." : null;
            if (problem is null)
            {
                try { ValidateHeaders(headers, "Excel"); }
                catch (TransactionImportRejectedException ex) { problem = ex.Message; }
            }
            return new(sheet, headers, rows, total, problem);
        }

        private (List<SheetData> All, SheetData? Selected) Select(string? id)
        {
            var all = sheets.Select(sheet => LoadSheet(sheet, false)).ToList();
            var candidates = all.Where(s => !s.Sheet.Hidden && s.Problem is null).ToList();
            var selected = id is null ? candidates.Count == 1 ? candidates[0] : null : all.SingleOrDefault(s => s.Sheet.Id == id)
                ?? throw Reject("The selected worksheet does not exist in this workbook. Select it again.");
            if (selected?.Problem is { } problem) throw Reject($"Worksheet '{selected.Sheet.Name}': {problem}");
            if (selected is null && all.All(s => s.Problem is not null)) throw Reject("No usable worksheet was found. " + string.Join(" ", all.Select(s => $"{s.Sheet.Name}: {s.Problem}")));
            return (all, selected);
        }

        public TransactionImportInspection Inspect(string? id)
        {
            var (all, selected) = Select(id);
            return new(bytes.Length, Convert.ToHexString(SHA256.HashData(bytes)), selected?.Headers ?? [],
                selected?.Rows.Select(r => (IReadOnlyList<string>)r.Cells.Select(c => c.Display()).ToArray()).ToList() ?? [],
                selected is null ? null : CreateSuggestedProfile(selected.Headers, ResolveColumns(selected.Headers, false, "Excel"), "Excel"),
                all.Select(s => new ImportWorksheetOption(s.Sheet.Id, s.Sheet.Name, s.Sheet.Hidden, s.Count, s.Problem)).ToList(),
                selected?.Sheet.Id, selected?.Sheet.Name, selected?.Rows.Select(r => r.Number).ToList());
        }

        public TransactionImportReadResult Read(ImportProfileDefinition? profile, string? id)
        {
            if (profile is not null) { ImportParsingOptions.ValidateDateFormat(profile.DateFormat); ImportParsingOptions.ValidateNumberCulture(profile.NumberCulture); }
            var (_, selected) = Select(id);
            if (selected is null) throw Reject("Choose a worksheet before uploading for review. Worksheets are never merged.");
            var data = LoadSheet(selected.Sheet, true);
            var columns = profile is null ? ResolveColumns(data.Headers, true, "Excel") : ResolveProfileColumns(data.Headers, profile);
            var mapped = new[] { columns.DateIndex, columns.DescriptionIndex, columns.AmountIndex, columns.DebitIndex, columns.CreditIndex, columns.CategoryIndex, columns.SubcategoryIndex }.Where(i => i >= 0).Distinct().ToArray();
            var rows = data.Rows.Select(source =>
            {
                var values = source.Cells.Select(c => c.Display(profile)).ToArray();
                var row = ParseRow(data.Headers, values, columns, source.Number, profile?.AmountConvention ?? ImportAmountConvention.SpendingPositive,
                    "Excel", profile?.DateFormat, profile?.NumberCulture);
                var errors = mapped.Where(i => source.Cells[i].Error is not null).Select(i => $"{data.Headers[i]}: {source.Cells[i].Error}").ToList();
                if (row.ValidationMessage is not null) errors.Add(row.ValidationMessage);
                var message = errors.Count == 0 ? null : $"Worksheet '{data.Sheet.Name}', row {source.Number}: " + string.Join(" ", errors);
                if (message?.Length > ImportTransactionDraft.ValidationMessageMaxLength) message = message[..(ImportTransactionDraft.ValidationMessageMaxLength - 3)] + "...";
                return row with { RawData = SerializeRawRow(data.Headers, source.Cells.Select(c => c.Value).ToArray(), "Excel"), ValidationMessage = message };
            }).ToList();
            return new(bytes.Length, Convert.ToHexString(SHA256.HashData(bytes)), rows, data.Sheet.Id, data.Sheet.Name);
        }

        public void Dispose() => archive.Dispose();
        private enum CellStyle { Number, Date, Ambiguous }
        private sealed record Sheet(string Id, string Name, bool Hidden, string Path);
        private sealed record Cell(string Value, decimal? Number = null, DateOnly? Date = null, string? Error = null)
        {
            public string Display(ImportProfileDefinition? profile = null) => Date?.ToString(profile?.DateFormat ?? "yyyy-MM-dd", CultureInfo.InvariantCulture)
                ?? Number?.ToString(profile?.NumberCulture is { } culture ? CultureInfo.GetCultureInfo(culture) : CultureInfo.InvariantCulture) ?? Value;
        }
        private sealed record SourceRow(int Number, Cell[] Cells);
        private sealed record SheetData(Sheet Sheet, string[] Headers, List<SourceRow> Rows, int Count, string? Problem);
    }
}
