# Annual-report transaction drill-downs

Annual overview is calculated from existing monthly budgets and saved
transactions. Its spending links explain those transactions; they do not create
another source of truth or change budget data.

## Filters and navigation

Every actual-spending link preserves the report's selected calendar year (or
individual calendar month), Household/Personal budget inclusion, household
currency, and applicable category. Expense refunds are included as negative
spending. Income, transfers, budget-excluded rows, voided rows, and transactions
in other currencies are omitted, following the existing report rules.

Parent-category links include direct subcategories; child links select that child
only. Uncategorized links select uncategorized positive spending, not
uncategorized income. Deactivated categories remain available for historic
drill-downs. An unavailable category is retained rather than silently changed to
all categories.

The transaction page displays active report filters separately from editable
controls. Unapplied control changes do not affect results or export. Applying
different filters, resetting them, or switching households marks the view as no
longer matching the original report. Pagination alone does not. Restore report
filters returns to page one, honoring unsaved transaction/inclusion protection.
Restoration is offered only in the originating household.

Return to Annual overview preserves the selected report year and scope. Origin
metadata in the link is descriptive only; it grants no access, cannot select
another user's Personal scope, and contains no clicked financial amount.

## Matching totals

The transaction list API adds `totalsByCurrency`, a dictionary of currency to
signed decimal amount over **all** authorized matching transactions, before
pagination. Counts, rows, and totals use the same privacy and search criteria.
SQL Server uses `GROUP BY`/`SUM`; the SQLite integration-test provider uses an
exact decimal sum of the same filtered amount/currency projection because it
cannot aggregate decimal amounts natively.

The page shows these all-page totals, never a sum of just the visible page. With
an annual spending drill-down, the selected currency total reconciles with the
corresponding report amount. General transaction searches show separate totals
for each currency; no conversion or cross-currency total is implied. Positive
amounts mean spending and negative amounts mean income, refunds, or credits.
An empty filtered currency view displays zero, while a failed request displays
an error and retry action instead of a misleading zero or stale total.

Totals reflect latest saved data, not a frozen report snapshot. If transactions
change after opening a report, return to Annual overview to recalculate it.
Saving an inclusion or financial correction refreshes matching totals; a failed
refresh hides the stale totals while preserving other unsaved row editors.

CSV export keeps the active applied filters and includes every matching row,
regardless of the selected list page. Existing household authorization and
private-account redaction continue to apply to list rows, aggregates, and export.

## Verification and deployment

- Browser tests exercise real report links, return navigation, pagination,
  export filters, pending/applied changes, restoration, edit guards, missing
  categories, household context, empty data, and failures.
- API integration fixtures include over 100 transactions, both budget scopes,
  multiple currencies, root/detail/deactivated categories, refunds, income,
  transfers, uncategorized rows, excluded/voided rows, private accounts, and
  unauthorized households. Report, matching totals, all pages, and export
  reconcile using exact decimal values.
- A no-connection SQL Server test verifies that the production aggregate
  translates to SQL, retains privacy/filter predicates, and precedes pagination.
- Manual checks are in [the regression checklist](manual-qa-regression-test-plan.md).

No migration or database update is needed for this change. Deploy the server and
client together because the client consumes the new list-response field.
