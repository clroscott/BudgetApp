# Bounded staged-import reads (#212, outcome 1)

This documents the first of three independently reviewable outcomes, not completion
of #212. [Targeted commands](import-targeted-commands.md) are now implemented as the
second outcome, with optional richer responses and existing response compatibility.
The review screen still uses its existing read/refresh contracts.
No schema migration, production database or email configuration change is needed.

## New read-only endpoints

Both are under `/api/households/{householdId}/imports/{importFileId}` and require
the same confirmed account, household membership and account visibility as the
existing import-detail read.

- `GET /summary`: file/account/currency/status metadata, worksheet provenance,
  permission information and exact aggregate counts for every draft in the batch.
  It does not load draft entities or parse raw rows.
- `GET /drafts?filter=All&page=1`: a summary plus `items`, `filter`, `page`,
  `pageSize`, `totalCount` and `totalPages`. Page size is server-fixed at 100.
  `totalCount` is the entire matching set, not this page. `summary.counts` always
  describes the whole batch, independently of the selected filter.

Supported filters match the existing screen: `All`, `Pending`, `Uncategorized`,
`ParentOnly`, `Categorized`, `PossibleDuplicates`, `Invalid`, `Approved`, `Excluded`.
ParentOnly means a selected parent **with children**, including inactive parents
and children. A root without children is not ParentOnly. Categorized includes
both parent and child selections. Queries are filtered, counted and paged in SQL.

Rows order by original source row number, then ID. IDs and worksheet/row provenance
do not change. Pages beyond the last matching page clamp to the last page. Empty
results have page 1, totalCount 0 and totalPages 0. Unsupported filters and invalid
pages return 400; callers cannot request an unbounded page size.

Counts include total/valid/invalid/approved/excluded/possible-duplicate/pending,
unchecked-duplicate and valid-pending rows. They are computed from all stored
drafts, not a capped list, filtered page or cached file counters. Aggregation and
count queries do not select RawData. At repository level a page uses three SQL
queries (global counts, filtered count, bounded projection); a summary uses one.
Existing authorization/account lookups are additional and remain unchanged.

Row amounts, descriptions, imported category labels and budget inclusion/control
permissions use the same mapping as the existing detail endpoint. A Viewer cannot
edit shared-account imports or change Household inclusion; their own personal
imports retain existing permitted actions. Another member's private imports and
imports under a different household remain inaccessible. CanEdit is the existing
account-level permission flag, not permission to mutate a Completed import:
callers must also check status; commands continue to require ReadyForReview.

The projection excludes original parsed values and review-audit columns. For
label compatibility, RawData is read and parsed only for the requested page, and
is never included in the response. Complete removal of repeated label parsing
(for example, persisted normalized labels with a safe legacy transition) is not
claimed here. The existing full-detail endpoint remains unchanged for compatibility
until the later client transition; the current UI does **not** gain bounded reads yet.

These are ordinary database reads, not a new point-in-time snapshot or ETag
protocol. Concurrent commands can change data between count/page queries or
separate requests. UpdatedAtUtc is file metadata, not a new row-write token.
Existing atomic completion, uniqueness and audit rules are retained. The targeted
command outcome adds optional expected-version checks and advances write timestamps
monotonically; see its contract for 409 handling. Client integration must still
handle invalidated counts/pages and ownership deliberately.

## Verification and disposable profiling

Integration tests compare the paged records with the existing detail records,
cover every filter, empty/invalid queries, stable/clamped pages, state changes,
completed imports, worksheet provenance, signed four-decimal amounts, and private
account/Viewer/outsider behavior. Service tests prove no full-batch read or write
is used, including cancellation and inaccessible imports. SQL Server provider
tests intercept commands without connecting to any database and verify SQL-side
counts, filters, deterministic OFFSET/FETCH, bounded projection and no tracking.
These translation checks are not a claim of real SQL Server execution testing.

The synthetic HTTP fixtures use SQLite in memory and recording-only test email;
they never use Production. Uncompressed JSON payloads measured on 2026-10-13:

| Batch rows | Existing full detail (bytes) | New 100-row page (bytes) | Summary (bytes) |
| ---: | ---: | ---: | ---: |
| 100 | 59,251 | 59,457 | 420 |
| 1,000 | 590,705 | 59,464 | 425 |
| 10,000 | 5,914,209 | 59,471 | 430 |

The small page-size changes come from count/page digits, not added rows. No
machine-specific millisecond assertion is used. Evidence is generated under the
ignored `artifacts/import-draft-read-qa` directory; reproduce with:

```powershell
dotnet test BudgetApp/BudgetApp.Tests/BudgetApp.Tests.csproj --no-restore --filter 'FullyQualifiedName~ImportDraft' --logger 'trx;LogFileName=import-draft-read.trx' --results-directory artifacts/import-draft-read-qa
```

The owner's manual sweep (#197) remains deferred. API regression cases are added
to the permanent manual QA plan, but not marked passed from automated evidence.

Final checks on 2026-10-13: 659 backend tests and 615 frontend tests passed;
client lint/build and diff whitespace checks passed. No production database or
real email was used. This first outcome is uncommitted and needs no migration.

## Remaining separate outcomes

1. Target row commands and return changed rows/summary information without
   full-batch tracking: implemented, independently verified in outcome 2.
2. Integrate server paging/targeted refreshes into the client, preserve dirty
   corrections and explicit clearing across pages/filters, preserve #214/#215
   ownership/history behavior, and make all-matching bulk actions operate on the
   full server-side matching set. Do not substitute only the fetched page.

User decision (2026-10-14): keep these outcomes on the same #212 branch, with
independent verification and commit checkpoints. Do not close #212 or remove the
compatibility endpoint before client integration is complete. Repeated label
parsing is currently bounded to read pages/changed rows, not eliminated entirely.
