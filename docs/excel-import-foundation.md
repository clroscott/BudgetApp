# Excel import foundation (#22)

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

## Part 2: pending, same branch / separate commit

Do not enable an Excel reader until these pieces land together:

- Enforced ZIP/XML expansion, entry, worksheet, column, cell/text and row limits;
  bounded shared strings/styles and cancellation. The compressed upload cap alone
  does not prevent excessive resource use. No filesystem extraction or fetching
  external relationships.
- `.xlsx` inspection, visible single-sheet auto-selection, explicit multi-sheet
  selection/preview and clearly labeled worksheet context. Blank/hidden sheets
  have explained handling; no automatic merging or hidden-sheet selection.
- Typed stored cell values, Excel date-system conversion, leading-zero text,
  cached-formula handling without calculation, and explicit parsing options for
  ambiguous regional text values. Error cells or missing usable formula caches
  are explained; macros, encrypted and unsupported workbooks are rejected.
- Persisted original worksheet and row provenance, and worksheet-aware same-file
  duplicate checks so a second worksheet is not mistaken for a repeat of the
  first. Existing transaction duplicate rules apply across formats.
- Shared profile integration and account/privacy permissions; neutral upload
  labels/accept filter without a separate review workflow. Failed/late inspection
  reads cannot replace another file/account/household context or discard edits.
- Reader, API and UI regressions plus large disposable-workbook manual QA. No
  direct official-transaction creation from upload.

The foundation does not add regional parsing preferences or change existing CSV
interpretation. They require an explicit, backward-compatible design in Part 2.
Permanent Part 1 manual checks are in the [QA checklist](manual-qa-regression-test-plan.md#format-neutral-import-foundation-22-part-1).
