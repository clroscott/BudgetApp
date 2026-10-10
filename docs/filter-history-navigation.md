# Filter history and accepted navigation (#215)

The router publishes the accepted `path`, `search`, and `hash`. A query change
updates consumers without remounting the route. `PageNavigation` still depends
only on `path`: query, scope and household changes do not announce a new page
or focus its heading. Help topics retain their deliberate topic-heading focus.

## History rules

- Transactions: typing changes draft controls only. Apply, Reset, an available
  saved preset, Restore report filters, and paging add a history entry for the
  applied view. Identical URLs add nothing. Back/Forward restores the controls,
  applied query, page and original annual-report context together.
- An unavailable preset is staged for explicit correction, not written to the
  URL or applied as a broader search. Existing permission checks remain on the
  server; IDs in a URL grant no access.
- Dates, account, category/subcategory, description, currency, spending-only and
  budget inclusion use the existing transaction query model. That same query
  feeds API reads and exports. URL-only date-mode fields preserve preset intent.
  History retains the dates actually applied to a rolling search; applying it
  again resolves fresh dates. Saved presets remain rolling rather than snapshots.
- Original annual drill-down filters are retained in `reportFilters`, independently
  of the current query. Existing #175 links without that parameter still work.
  Changing filters does not redefine the original report or imply reconciliation.
  Report metadata does not become an API filter or a permission bypass.
- Annual overview: scope choices add an entry. Valid year edits replace the
  current entry so typing a year does not create an entry for every digit. Direct
  links and Back/Forward restore both year and scope. Invalid/incomplete year
  text does not request an invalid report.
- Import review: file-status choices, file choices and file-list paging add an
  entry. First matching file selection, server page normalization and selection
  after discard replace the current entry. URLs outside the visible list page
  remain reachable. Transaction-row filters are still local (no new URL meaning).

Dirty financial edits use the existing confirmation guard. A canceled traversal
is restored with `history.go`, not another pushed entry, so Forward is preserved.
Consumers never see the rejected query. Automatic replacements are also blocked
while this restoration is pending. Known router-owned history entries carry the
existing navigation index; unindexed external entries retain the fallback behavior.

Reads from an obsolete query cannot replace current rows/totals or clear a newer
editor. Post-save refresh feedback is also bound to its original context; writes
are neither canceled nor retried automatically. Invalid transaction URLs expose
correctable errors rather than requesting an unrestricted transaction list.

## Verification

New page characterization tests reproduced three failures before page changes:
same-path report links retained old filters; applied filters never entered the
URL; same-path annual links retained the old year/scope. Automated regressions
cover query/hash publication, canceled Back/Forward, exact filter round trips,
report meaning, exports, saved presets, missing references and delayed reads.

`tools/LayoutQa/verify-filter-history.mjs` exercises the actual React app at
1440px and 390px with fictional intercepted GET responses. It blocks mutations
and external requests, uses disposable profiles, and writes ignored evidence
under `artifacts/filter-history-qa`. No database or email is used.

The owner's full manual sweep (#197), screen-reader verification and hosting
checks remain pending; synthetic browser coverage is not a claim those passed.

Verification record (2026-10-10): 615 frontend tests and 628 backend tests passed;
client lint/build passed. The six new actual-app history cases and ten existing
read-ownership browser cases passed at 1440px/390px with no mutation, external
request or page error. Changes are uncommitted; no database migration is required.
