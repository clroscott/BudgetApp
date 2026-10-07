# Saved transaction filters (#155)

Transactions has a compact **Saved filters** section. Choose a preset and apply it,
or expand **Save or manage presets** to name the applied filters, rename a selected
preset, or delete it. Saving does not change transactions, budgets, or shared
household activity. Deleting a preset does not reset the current search.

## Meaning and privacy

- Presets belong to the authenticated user **and** selected household. Other
  members, including owners/admins, cannot read or edit them. Viewers can manage
  their own preferences without gaining financial editing rights.
- Stored intent includes account, date mode, day count or fixed date/month/range,
  category type, parent/subcategory or uncategorized, description, currency,
  budget inclusion and spending-only. Pagination, result totals, permissions and
  annual-report origin metadata are not stored.
- Past X days is resolved against the browser's local calendar when applied.
  Specific dates/months/ranges stay fixed. Each application starts at page one;
  export uses the same applied query, not unapplied controls.
- Filter edits must be applied before saving. Names are trimmed, limited to 100
  characters, and unique ignoring case within this user's household presets.
  The initial limit is 100 presets per user/household.
- Applying rechecks membership and reference visibility. Archived/deactivated
  accessible records remain usable for historical searches. Missing, moved or
  inaccessible references retain their IDs, with generic warnings that disclose
  no private account names. They are staged for explicit correction without
  changing results. They are never silently removed to broaden the search.
- Annual-report context remains separate: changing filters marks the report as
  no longer matching, and restoration still uses the original report selection.
  The return link uses the registered `/budgeting/annual-overview` route.

## Persistence and recovery

Migration `20261007042139_AddSavedTransactionFilters` only creates the preference
table and indexes. It does not alter financial records. Apply it through the
existing Development/Production migration procedures before testing/deploying.

The authenticated household-scoped API is `/api/households/{id}/transaction-filters`.
Every operation verifies active membership and restricts records to the session
user. Existing confirmation, CSRF and transaction visibility rules still apply.
Creation uses a client-generated request ID retained on failure, making retries
idempotent. Renames and deletes use optimistic versions; same-name rename and
already-removed delete retries are safe. Failed requests keep safe entered names
and show errors/retry actions. Loading, successful emptiness, and unavailable or
stale retained presets are distinguished.

Automated tests cover filter intent/date boundaries, private CRUD, retry behavior,
CSRF/verification, household and user isolation, archived/missing references,
concurrency, unsaved transaction/name guards, page-one application, report
context and export. A read-only sample preview was checked at desktop and 390px
widths, including keyboard disclosure/application and horizontal overflow.
Real SQL Server migration application, 200% zoom and screen-reader behavior still
require the manual QA checklist.
