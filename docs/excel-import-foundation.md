# Excel import foundation (#22)

Part 2 enables `.xlsx` in the existing Import transactions page. Part 1 below
documents the earlier, CSV-only checkpoint; it is not the current feature gate.

## Part 1: format-neutral boundary, CSV only

`TransactionImportService` and profile inspection now depend on
`ITransactionImportReader`. The dispatcher receives the original filename for
both inspection and staging, validates the supported extension before consuming
the content, and delegates CSV decoding to `CsvImportReader`.

Format-neutral row/result/inspection/profile-definition types, rejection errors,
and common upload/row limits replace CSV-specific application contracts. API
routes, multipart fields, response property names, CSV templates, user-facing CSV
labels and staging/review/approval remain unchanged. No database migration,
workbook package or `.xlsx` capability is added in this part.

`CsvImportReader` retains its text decoder, quoting, BOM handling, bounded buffering,
five-row preview, byte hash and existing source-row numbering behavior. The
extracted `TransactionImportRowParser` owns column aliases/profile matching,
required-header validation, date/decimal parsing, debit/credit and sign rules,
raw-row serialization and category names. Its CSV defaults preserve current
messages; future format readers can use their own source label. Final draft
validation, categorization, duplicate matching and permissions remain in their
existing application/domain services.

Inspection previously did not validate the file extension. It now uses the same
supported-format gate as upload: CSV bytes named `.xlsx`, `.xls`, `.xlsm` or another
unsupported extension are rejected rather than being treated as workbook support.
Valid `.csv` files, including case-insensitive extensions, keep their behavior.

Compatibility tests cover byte hashes/raw values, quoted descriptions, leading-zero text,
exact signed amounts, existing date formats/currency strings, debit/credit refunds,
profile inspection/sign conventions, structural errors, encoding detection,
10 MB/10,000-row bounds, cancellation and caller-owned streams. Integration
coverage confirms workbook rejection creates no import/official transactions,
Viewer/private/archived-account permissions remain intact, and existing CSV
staging/approval/completion paths still work.

Part 1 verification (October 8, 2026): 564 backend tests, 498 client tests,
client lint, client production build and solution build pass. The solution build
reports zero warnings/errors. Test databases are isolated; no application database
or real email delivery was used. The live CSV smoke checks remain pending in the
permanent manual checklist.

## Part 2: Excel staging, same branch / separate commit

### User workflow and compatibility

1. Choose an account, CSV or `.xlsx` file, and optional existing import profile.
2. For Excel, choose **Preview workbook**. The sole usable visible worksheet is
   selected automatically. Multiple candidates (or hidden-only candidates) require
   a deliberate choice. Blank/header-only/merged or invalid-header sheets explain
   why they cannot be selected. No worksheets are combined.
3. Check the selected worksheet name and first five rows, including original Excel
   row numbers. Use an existing CSV-compatible profile or save an unfamiliar column
   mapping. Profile creation remains Owner/Admin only; a Viewer may use an existing
   profile for their own private account, but cannot create shared configuration.
4. **Upload for review** stages only that worksheet. The existing review page keeps
   corrections, categories/subcategories, duplicate acknowledgements, budget
   inclusion, approval/exclusion and completion. Upload and preview never create
   official transactions. Completion keeps its atomic/idempotent behavior.

The API routes and existing CSV multipart fields remain unchanged; `worksheetId`
is optional for Excel and rejected for CSV. Profiles/templates remain shared
household configuration; imported private-account data remains owner-only. Both
inspection and staging enforce active account and existing account-owner/role rules
before reading workbook contents. Stable tutorial target IDs remain unchanged.

`ImportFiles` gains nullable original worksheet ID/name; existing rows remain null.
The original row number continues on each draft and official transaction linkage.
Same-file detection uses account + byte hash + worksheet ID, so two sheets from
the same workbook can be staged separately. Transaction duplicate matching still
uses existing date/amount/description rules across CSV and Excel.

`ImportProfiles` gains nullable `DateFormat` and `NumberCulture`. Null retains
legacy CSV defaults (including month-first ambiguous text dates). Explicit text
date formats are `yyyy-MM-dd`, `yyyyMMdd`, `MM/dd/yyyy`, `dd/MM/yyyy`; number formats
are `en-US`, `en-CA`, `en-GB`, `fr-CA`, `de-DE`. The mapping and profile editors show
these options. They affect future imports only, not saved transactions. Native
numeric/date Excel cells are rendered for that profile before shared validation,
so a comma-decimal profile does not reinterpret a native decimal's dot separator.

### Stored values, not an Excel calculation engine

`XlsxImportReader` is a restricted, streaming SpreadsheetML reader using .NET ZIP
and XML APIs; it does not add a general workbook-editing/calculation dependency.
It reads standard/strict `.xlsx` workbook relationships, worksheets, inline/shared
rich strings, cached scalar results, numeric values and date styles. No ZIP parts
are extracted, relationships fetched, formulas/macros run, or embedded objects
opened. Legacy `.xls`, `.xlsm`, macro parts and encrypted OLE containers are rejected.

The first nonblank row must be a simple, unique nonempty header row. Transaction
rows must remain within those columns; blank rows are skipped without renumbering.
Merged layouts, chartsheets and unsupported/ambiguous values receive guidance;
this is not a visual-format/layout interpreter. Leading-zero **text** survives;
display-only padding of a numeric cell does not turn that stored number into text.
Financial values use stored decimal values, not rounded Excel display strings.

Formula cells use their saved result only. Missing/error/unsupported results in
mapped columns make correctable invalid drafts with worksheet/row context; ignored
columns do not invalidate transactions. The preview warns that caches can be stale
and asks users to recalculate/save or paste values. This follows Excel's stored
[formula-result representation](https://learn.microsoft.com/en-us/office/open-xml/spreadsheet/working-with-formulas).

Dates respect the workbook's [1900/1904 date system](https://support.microsoft.com/en-us/excel/date-systems-in-excel).
Serial 60 in the 1900 system is rejected rather than inventing a calendar date.
Time-only styles are not treated as dates. Locale-dependent built-in date/time
styles without an explicit format code are correctable failures rather than guesses;
see Microsoft's [number-format definitions](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.spreadsheet.numberingformat).

### Enforced resource limits

Limits apply during inspection and staging; oversized/malformed reads occur before
persisting the import. ZIP expansion is measured, not merely trusted from its index.
MB means 1,024 × 1,024 bytes here.

| Resource | Limit |
| --- | --- |
| Compressed upload / multipart request | 10 MB / 11 MB |
| Total expanded package / single expanded part | 100 MB / 32 MB |
| Metadata XML part | 1 MB; maximum depth 32 |
| Package entries / worksheets | 512 / 20 |
| Columns / nonblank transaction rows per sheet | 100 / 10,000 |
| Physical rows per sheet (including blanks) | 20,000 |
| Cell or shared-string text | 4,096 characters |
| Shared strings / combined shared text | 100,000 / 2,000,000 characters |
| Number formats / cell styles | 4,096 each |
| Decoded cells per operation (survey + selected reread) | 500,000 |
| Retained selected-sheet text | 5,000,000 characters |
| Cell/shared-string complexity | 512 XML nodes; depth 16 |
| Worksheet XML depth / read timeout | 32 / 15 seconds |

Unsafe/duplicate ZIP paths, DTDs/entities, malformed references, invalid ordering,
and data beyond header width fail safely. All worksheets are bounded while surveyed;
an oversized sheet is not ignored simply because another sheet was selected. The
survey keeps at most five preview rows per worksheet. Cancellation is checked while
copying, decompressing and parsing; callers retain ownership of the input stream.

### Deployment and verification

Migration `20261009012635_AddExcelImportProvenanceAndParsing` adds four nullable
columns only; it does not change budgets, transaction amounts or existing profiles.
Apply it with the existing Development database update procedure before running the
new server locally; Production uses its normal backed-up deployment procedure.
No database update is run as part of implementation/testing.

Automated coverage includes CSV compatibility, worksheet discovery/selection,
actual row provenance, native/ISO/serial dates, text escapes and leading zeros,
localized text/native numeric values, cached/missing/error formulas, negative and
four-decimal amounts, sparse rows, malformed/expanded/oversized packages, a 10,000-row
synthetic workbook, cross-format duplicates, repeat-sheet uploads, profile reuse,
owner/Viewer privacy, invalid-draft completion, completion retry, late responses,
concurrent requests and failed saves. All test data is synthetic/disposable;
test databases and email delivery are isolated/fake or loopback, not Production.

Live Excel/browser/keyboard/zoom checks remain pending with the user. Permanent
cases are in the [manual QA checklist](manual-qa-regression-test-plan.md#excel-workbook-import-22-part-2).

Part 2 verification (October 8, 2026): 618 backend and 514 client tests pass,
as do client lint/build and the solution build (zero warnings/errors). The offline
EF model check reports no pending model changes; its SQL preview contains only
the four nullable column additions and migration-history entry. Existing Windows
certificate/loopback tests and Visual Studio SDK builds run outside the sandbox
because their installed runtime/configuration files are sandbox-restricted. A
dashboard assertion was changed to await its asynchronously loaded budget card;
no dashboard behavior was changed. Live/manual checks above remain pending.

### Sample-workbook compatibility follow-up (October 8, 2026)

The first downloaded sample was incorrectly rejected as unsupported: its workbook
MIME type uses an OPC extension `Default` rather than a part-specific `Override`.
The reader now resolves both declarations, with an explicit override taking
precedence. Unsupported/macro declarations, duplicate matching declarations and
missing workbook types remain rejected; package/resource safeguards are unchanged.

The exact synthetic download is retained as `BudgetApp/BudgetApp.Tests/Fixtures/Imports/testtemplate.xlsx`.
Reader and API regressions confirm its two native dates/amounts survive preview and
staging and that no official transactions are created. This follow-up requires no
additional migration. Live retry of the same file after a server rebuild remains
the user's manual check.

Verification: all 66 Excel reader/API cases and all 628 backend tests pass. The
full suite runs from its normal output directory because four existing maintenance
script tests discover repository tools relative to that directory. The separate
temporary build passed the Excel cases but could not locate those four scripts;
the normal-output rerun passed them. Client code is unchanged in this follow-up.
