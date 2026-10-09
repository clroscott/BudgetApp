# Lightweight dashboard summaries (#211)

The dashboard now uses `GET /api/households/{householdId}/dashboard-summary`
with year, month and scope, plus optional `includeRecent=true`. It returns current
budget totals/status/currency and warnings, the exact ready-import count,
uncategorized-spending count, two setup presence flags, and optional recent rows.
Layout, authentication and tutorial preferences still use their existing reads.

## What was removed

- Full budget-editor responses, historical actuals, previous-month budget and
  annual-target queries. The summary reuses the current monthly-budget category
  projection/rollup with grouped actuals from #210; it does not invent a new
  interpretation of Overall/Detailed or parent/child totals.
- Full account lists where only an active-visible-account flag was used.
- Normal 100-row transaction lists, their aggregate totals and pagination counts
  where only presence/counts or five displayed rows were needed.
- Recent-row reads when that card is hidden. The client first resolves its layout
  to make the initial request with the correct inclusion flag. A layout failure
  does not prevent the independent summary from resolving or being retried.

The summary still needs current budget lines and expense-category metadata to
reconcile with the editor. These are bounded by configuration, not transaction
history, and are not returned as an editor model. No schema/index migration, cache
or financial write was added. Queries sharing the request's EF DbContext execute
sequentially; they must not run in parallel on that context.

## Recorded before/after

October 8, 2026: in-memory SQLite with 1,027 synthetic transactions and 120 ready
imports. `DashboardSummaryTests.RecordBeforeAfterQueryCountsAndJsonBytes_WithDisposableSyntheticHistory`
executes the five former application reads and the new summary against exactly
the same data. SQL commands are counted with an EF interceptor; JSON bytes are
UTF-8 output using ASP.NET's Web serializer defaults, summed across the old five
responses. No app database or real email is used.

| Read | Summary API requests | Database queries | JSON bytes | Detailed transaction rows |
| --- | ---: | ---: | ---: | ---: |
| Former dashboard | 5 | 19 | 148,677 | 200 |
| New, Recent hidden | 1 | 8 | 410 | 0 |
| New, Recent shown | 1 | 9 | 1,283 | 5 |

These counts exclude shared middleware/auth-session reads, dashboard layout and
tutorial reads, HTTP headers and compression. The sample has a saved CAD budget;
an absent budget adds the existing household-currency lookup. Payload sizes vary
with data. These are work/payload measurements, not a promise of particular page
latency, a cold-cache benchmark or a machine-specific timing gate. SQL Server
translation is checked separately without a connection: presence uses EXISTS,
attention uses COUNT, and recent uses TOP(5) with date/ID ordering and a minimal
projection. There is no full transaction SUM/list query in this activity read.

## Semantics and privacy retained

- Budgeted/Actual/Remaining match monthly-budget category totals. Uncategorized
  signed-net amounts stay separate, and mismatched currencies are not converted.
- Uncategorized attention counts are identical to the spending-only drill-down
  for the selected month/scope/currency; uncategorized refunds are not counted
  as positive spending. Other visible recent records remain across contexts,
  rather than silently becoming a second monthly spending list.
- The shared transaction-list query predicate is reused for activity. Only
  shared accounts, own private accounts, and explicitly shared permitted expenses
  are visible. A shared expense from another member's private account has its
  account name masked; no account ID, notes, merchant, or source metadata is in
  the six-field recent response.
- Import counts reuse #209's server aggregate and private-account visibility.
  Presence flags do not infer that other members' private accounts exist.
- Active household membership is required before summary reads; the existing
  verified-email/session protections apply to the endpoint. Private summary
  responses use Cache-Control: no-store; no shared/user cache was introduced.
- Existing stale/failed feedback, context/late-response protection, layout save
  guards, focus conventions and drill-down links remain in place.

## Repeat verification

From the repository root:

```powershell
dotnet test BudgetApp/BudgetApp.Tests/BudgetApp.Tests.csproj --no-restore -p:SkipClientProjectReference=true --filter 'FullyQualifiedName~DashboardSummary' --logger 'console;verbosity=detailed'
```

This uses only in-memory databases and synthetic data. It runs total/count
parity, zero/no-budget, Viewer, mixed-currency, refund, private/shared expense,
uncapped import count, cancellation, membership/session, cache-header and SQL
translation tests. The measurement case prints fresh counts/bytes; assertions
gate bounded rows, fewer reads and semantic parity, not elapsed milliseconds.

Verification for this change: 538 backend tests, 498 client tests, client lint and
production build pass. Live Development keyboard/layout checks and financial
spot-checks remain pending in the permanent [manual QA checklist](manual-qa-regression-test-plan.md#lightweight-dashboard-summaries-211).
