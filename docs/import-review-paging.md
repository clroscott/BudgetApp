# Paged import review (#212, outcome 3)

The review screen now uses the bounded server read and targeted command contracts
from outcomes 1 and 2. All three outcomes stay on the existing #212 branch, per the
owner's decision. This outcome is left uncommitted for the owner to review/commit.
No database migration, Production operation or email configuration change is needed.

## User behavior

- The grid still displays up to 100 rows. It now downloads only that server page,
  rather than downloading the whole import and slicing it in the browser.
- Row filters, matching counts and ordering use the server contract. Summary
  statistics and whole-import approval/completion controls use exact global counts,
  not counts of the visible page. File selection/deep links and file-filter history
  remain independent of row paging. Row filter/page remain local screen state, as
  before; this does not introduce a second URL/history interpretation.
- Unsaved row corrections live in an import-scoped ID map. Page/filter changes keep
  them, including an explicitly cleared category and previously staged budget flags.
  Changing row pages/filters does not prompt for these retained corrections.
  Leaving the import still uses the existing unsaved-change guard. Unsaved rule-editor
  changes prompt because changing rows closes that editor; cancellation preserves it.
  Row pages/filters cannot change during an active write.
- Single corrections/decisions patch the returned row and global summary. A row
  leaving its current filter, deletion, or a bulk operation refreshes only the
  requested bounded page. Ordinary row changes do not reload the file list. Rule
  matching is refreshed when descriptions/categories, exclusion, removal or rules
  can change its result, not merely on Pending-to-Approved changes or page navigation.
- A correction that reveals a **new** possible duplicate stops Save and approve
  after saving. The user sees the warning and must deliberately approve again.
  Approval uses the returned saved state and exact updated version.
- Failed saves preserve corrections. A 409, transport failure or server error
  blocks further writes until a read-only reload/reconciliation. The recovery button
  does not discard local corrections or replay writes. A successful command followed
  by a failed page read reports the known save outcome and offers read-only retry.
  Late results cannot affect another import or household. Automatic last-page
  normalization does not leave save/remove controls stuck busy.

## All-matching budget choices

`POST /api/households/{householdId}/imports/{importFileId}/budget-choice-preview`
is a **read-only** preview. It accepts a supported row filter, desired Personal /
Household flags, locally edited draft IDs (maximum 10,000), and the exact current
import timestamp. It requires the same confirmed account, visibility, edit and
ReadyForReview checks as the existing workflow, plus antiforgery protection.

SQL applies the filter and permission/Excluded/linked-row exclusions across the
whole matching set. The response contains saved correction baselines only for rows
whose flags differ or locally edited rows that need comparison/reversal. Baselines
contain ID, date, amount, description, category and budget flags; no RawData,
original upload columns, other users' personal inclusion identity or tracked entities.
Other/foreign import IDs supplied in the edited-ID list cannot expose their rows.
ID parameter lists are chunked at 500; skipped/unchanged counts include off-page rows.

The client merges these baselines with its existing corrections. Applying choices
still only stages them locally. **Save all corrections** sends the changed rows to
the existing atomic bulk command. A second choice can reverse the first without
dropping other edits. Page-only choices use the visible page. Cached previews are
component-local, keyed by household/import/filter/preset/saved version, and reused
only when they already cover all relevant edited IDs; staging their own choices
does not re-download the same baselines.

This explicit all-matching action can legitimately return/send many changed rows.
It does not raise the 100-row ordinary read bound or fetch all pages automatically.
A no-op preview has no row payload, even for a 10,000-row import.

## Resource use and limits

Rule preview now selects only eligible descriptions/category IDs, without original
upload JSON or full draft entities. Whole-batch rule execution/duplicate checking/
completion still keep their existing global semantics; this is not a redesign of
those commands. Original-category label parsing is intentionally retained for
compatibility, but only for a requested page (at most 100) or changed rows. Targeted
patches avoid repeatedly reading/parsing every source row, and normal page reads do
not trigger rule-preview reloads. No unbounded source-data cache or label backfill
schema migration was introduced.

Backend synthetic HTTP measurements: unchanged previews are 83 / 84 / 85 bytes at
100 / 1,000 / 10,000 rows. Changing all rows returns 100 / 1,000 / 10,000 lightweight
baselines (22,630 / 225,580 / 2,255,080 bytes), proportional to the explicit change set.
Existing outcome-1/2 measurements remain valid: 10,000-row full detail was about
5.9 MB versus a 100-row page about 59 KB and one-row change about 1 KB.

Actual-app browser harness measurements at 1440px and 390px: maximum ordinary page
responses are 58,145 / 58,152 / 58,159 bytes for 100 / 1,000 / 10,000 rows. These are
fictional browser fixtures, not production latency or database benchmarks. A single
correction makes no extra page or file-list read; file list and categorization-rule
reads do not grow with page navigation. No machine-specific timing gates are used.

## Verification and remaining sign-off

Final automated checks on 2026-10-14: all 677 backend tests and 630 frontend tests
passed, with client lint/build and Git whitespace checks clean. The read/failure,
filter/history and large-import browser harnesses cover 22 cases in total. Manual
owner approval remains separate and deferred as described below.

Backend tests use disposable SQLite data and recording-only email. SQL Server
translation tests do not connect to a database; they verify minimal projections,
filtering, parameter chunking and no tracking, not live SQL Server performance.

Browser harnesses use disposable profiles with every API response intercepted:

- `tools/LayoutQa/verify-import-paging.mjs`: 100/1,000/10,000-row cases at desktop
  and narrow widths; bounded reads, cross-page corrections, all-matching staging,
  single-row patches, global approval/completion and completed read-only controls.
- `tools/LayoutQa/verify-read-ownership.mjs`: initial/refresh failures and late reads.
- `tools/LayoutQa/verify-filter-history.mjs`: accepted/canceled Back/Forward and
  query-only focus/history behavior.

Raw generated evidence is ignored under `artifacts/import-draft-read-qa`,
`artifacts/import-paging-ui-qa`, `artifacts/read-ownership-qa` and
`artifacts/filter-history-qa`. These checks use no real application server/database,
Production data, email delivery or financial writes.

Permanent manual regression cases are in `docs/manual-qa-regression-test-plan.md`.
The owner's full #197 manual sweep remains deferred. The automated browser checks
are not a claim of owner manual approval, screen-reader sign-off, or real SQL Server
performance testing. Before merging, do the focused disposable-import smoke test:
edit across row pages, test page-only/all-matching budget choices, save, review
duplicates/categories, approve and complete once. Completed rows should be read-only.
