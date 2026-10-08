# Code cleanliness and performance review

Reviewed: 2026-10-07. Repository: `clroscott/BudgetApp`. Baseline: `main` at `febed517580795f788f7ba57ffb0a6526381ca1e`.

## Executive conclusion

There are worthwhile improvements, but this does not call for a rewrite or a new framework. The most actionable costs are in imports and financial read models, not simply in having large files.

Recommended order:

1. Replace two repeated import searches with indexed lookups.
2. Fix the newest-50 import-list limitation and inaccurate pending-import counts.
3. Aggregate budget actuals in SQL instead of transferring individual transactions for summaries.
4. Give the dashboard lightweight summaries instead of full editor/list responses.
5. Reduce import-review payloads, repeated refresh work, and unnecessary rendering.
6. Consolidate request/state conventions and CSS in small, behavior-preserving changes.

Performance optimization and code cleanup should usually be separate changes. Combining them makes financial regressions harder to identify. Priorities below are work-order recommendations, not security-alert severities or a claim that this laptop installation is unusable.

## Scope, evidence, and limits

The review traced React pages/providers, routing, API calls, application services, EF repositories/configuration, authentication/MFA flows, email delivery, tests, and CI. Particular attention went to dashboard, monthly/annual budgets, transactions/export, and CSV staging/review/completion.

Application source was not changed. No production database, deployment, email delivery, credentials, or GitHub board was changed or exercised. A local, ignored synthetic benchmark harness was created under `.artifacts/performance-review/`; it uses fake repositories and does not access SQL or SMTP.

Evidence labels:

- **Confirmed source behavior:** the implementation directly establishes the data flow or algorithm. This does not establish real-world latency.
- **Measured synthetic:** isolated local CPU timings using generated data. These are not production response-time measurements.
- **Profile first:** plausible costs requiring an actual browser profile or isolated SQL Server measurement before selecting an optimization.

Still unmeasured: real SQL Server execution plans/logical reads, large-database endpoint latency and allocations, concurrent load, rendered-browser interaction timing, and SMTP-provider latency. No extra access or approvals were requested after the user asked to step away.

### Verification baseline

| Check | Result |
| --- | --- |
| Frontend tests | 453 passed in 43 files |
| Backend tests | 468 passed, none skipped |
| Client TypeScript/Vite production build | Passed |
| Client lint | Passed |
| Main JS build output | 239.64 kB raw / 74.31 kB gzip |
| Main CSS build output | 82.93 kB raw / 14.34 kB gzip |
| Transactions page JS chunk | 34.65 kB raw / 9.37 kB gzip |
| Import review page JS chunk | 29.35 kB raw / 7.76 kB gzip |

Commands used: `npm test`, `npm run build`, `npm run lint`, and `dotnet test BudgetApp/BudgetApp.Tests/BudgetApp.Tests.csproj --no-restore --verbosity minimal -p:SkipClientProjectReference=true`. The .NET test command used the default Debug configuration; the client was built for production. Dependencies were already installed. This was not a fresh dependency audit or a standalone full Release solution-build verification.

Backend integration tests use isolated SQLite and a recording email sender. The existing SQL Server transaction-total test checks provider translation with connection/read interception; it does not contact SQL Server. Passing these tests does not prove SQL Server lock behavior, query-plan quality, or performance under load.

## Performance findings

### PERF-01 — Index import duplicate matching and completion linkage

**Priority:** P1, first implementation. **Evidence:** confirmed source and measured synthetic. **Size:** small.

[Duplicate matching](https://github.com/clroscott/BudgetApp/blob/febed517580795f788f7ba57ffb0a6526381ca1e/BudgetApp/BudgetApp.Application/Imports/ImportReviewService.cs#L700) scans all candidate transactions for each draft. Its worst-case work is rows × candidates. It is used during upload and review operations, including bulk changes. The application permits 10,000 CSV rows; a wide date range can also retrieve many existing candidates.

[Completion linkage](https://github.com/clroscott/BudgetApp/blob/febed517580795f788f7ba57ffb0a6526381ca1e/BudgetApp/BudgetApp.Application/Imports/ImportReviewService.cs#L625) calls `drafts.Single(...)` once for each newly created transaction. `Single` must check the collection for uniqueness, giving quadratic search work. This is a CPU issue, not an N+1 database-query issue.

Synthetic results, in milliseconds:

| Rows and candidates | Actual duplicate method | Lookup prototype | Reproduced completion search | Completion lookup prototype |
| ---: | ---: | ---: | ---: | ---: |
| 100 | 0.451 | 0.044 | 0.047 | 0.009 |
| 1,000 | 44.710 | 0.395 | 4.516 | 0.041 |
| 5,000 | 1,057.036 | 1.072 | 66.960 | 0.181 |
| 10,000 | 4,146.268 | 2.466 | 268.391 | 0.206 |

Method: median of three warm runs on .NET 10.0.12. Every row/candidate had the same date and amount but different descriptions, forcing nonmatching scans. The actual duplicate method ran with a fake candidate repository. The completion benchmark reproduced only its search loop, not full completion or database writes. Prototype timings include index construction. The harness was Release, but referenced the existing Debug application/domain assemblies. These numbers demonstrate scaling, not expected user wait times or a guaranteed speedup for every file.

**Change:** build a candidate index keyed by exact date, decimal amount, and trimmed description using ordinal case-insensitive equality; preserve the first candidate in the supplied sequence. Build a unique source-row lookup once for completion, or link the draft during transaction construction. Add cancellation checkpoints to long CPU loops where appropriate.

**Acceptance:** existing duplicate decisions remain identical, including whitespace/case, null/invalid draft fields, negative and four-decimal amounts, multiple matches, and no matches. Duplicate warnings/acknowledgment must remain mandatory. Completion remains atomic and idempotent, preserves unique import-row constraints, and never creates a second transaction on retry. Add 10,000-row benchmarks and correctness tests; do not put machine-specific millisecond assertions in ordinary unit tests.

### PERF-02 — Move import filtering/paging into SQL; count all pending imports

**Priority:** P1. **Evidence:** confirmed source; correctness as well as performance. **Size:** medium.

[ImportRepository](https://github.com/clroscott/BudgetApp/blob/febed517580795f788f7ba57ffb0a6526381ca1e/BudgetApp/BudgetApp.Infrastructure/Imports/ImportRepository.cs#L13) loads all visible import metadata. [ListAsync](https://github.com/clroscott/BudgetApp/blob/febed517580795f788f7ba57ffb0a6526381ca1e/BudgetApp/BudgetApp.Application/Imports/ImportReviewService.cs#L21) then sorts and takes 50 in memory. The page applies its status filter after this cap.

Consequences: an older unfinished import can be missing from “In progress” when 50 newer imports exist; dashboard attention counts can undercount even though the text says all visible imports. SQL also transfers more metadata than the endpoint returns.

**Change:** a server-filtered, stably ordered paged import list plus a separate aggregate pending-import count. Keep an explicitly selected import reachable when it is not on the current list page. Retain personal-account visibility rules.

**Acceptance:** seed more than 50 imports with an old pending import and many newer completed imports. It remains discoverable and the dashboard count is exact. Test equal upload timestamps, status/page changes, viewers, other users' personal accounts, and selection by URL. Never fix this merely by increasing the arbitrary cap.

### PERF-03 — Return grouped budget actuals, not individual transaction rows

**Priority:** P1 after the small import changes. **Evidence:** confirmed source; SQL impact still needs measurement. **Size:** medium/large.

[Monthly actuals](https://github.com/clroscott/BudgetApp/blob/febed517580795f788f7ba57ffb0a6526381ca1e/BudgetApp/BudgetApp.Infrastructure/Budgets/BudgetRepository.cs#L111), [historical actuals](https://github.com/clroscott/BudgetApp/blob/febed517580795f788f7ba57ffb0a6526381ca1e/BudgetApp/BudgetApp.Infrastructure/Budgets/BudgetRepository.cs#L168), and [annual transactions](https://github.com/clroscott/BudgetApp/blob/febed517580795f788f7ba57ffb0a6526381ca1e/BudgetApp/BudgetApp.Infrastructure/Budgets/BudgetRepository.cs#L221) materialize projected transaction rows before computing summaries. Monthly/annual currency-mismatch handling is also performed in application memory. [Annual overview](https://github.com/clroscott/BudgetApp/blob/febed517580795f788f7ba57ffb0a6526381ca1e/BudgetApp/BudgetApp.Application/Budgets/AnnualBudgetOverviewService.cs#L80) repeatedly filters the annual collection for its 12 months.

**Change:** SQL-translatable grouped read models for category/month amounts, conditional spending/income sums, uncategorized totals, and currency-mismatch counts. Return a bounded set of summaries rather than one record per transaction. Avoid parallel EF operations on the same scoped DbContext.

**Financial safeguards:** preserve legacy null-inclusion behavior, explicit Personal + Household inclusion, per-user personal selections, exclusions/voids, private-account visibility, expense refunds, income signs, uncategorized signs, mixed currencies, inactive categories, parent/child rollups, and No budget versus budgeted zero. Annual uncategorized spending and income must retain their separate positive/negative rules; a single net sum would be incorrect. Keep exact decimal arithmetic rather than casting to floating point to accommodate a test provider. Do not change historical-average calculations as part of this optimization.

**Acceptance:** old/new financial results agree exactly on adversarial fixtures; SQL Server translation tests demonstrate grouping before materialization; isolated SQL Server runs compare returned row count, logical reads, allocations, and p50/p95 latency at 1,000/10,000/100,000 transactions. Existing date/account/category indexes already exist: inspect execution plans before adding more indexes.

### PERF-04 — Create a lightweight dashboard read model

**Priority:** P2, follows PERF-02/03. **Evidence:** confirmed source. **Size:** medium.

[readDashboardSnapshot](https://github.com/clroscott/BudgetApp/blob/febed517580795f788f7ba57ffb0a6526381ca1e/BudgetApp/budgetapp.client/src/dashboard/dashboardSnapshot.ts#L55) makes four reads in parallel, then an uncategorized-transaction read after the budget currency is known. This is five data requests, excluding layout/tutorial/session reads. Both transaction calls use the normal 100-row list endpoint, which also computes full-filter counts and currency totals. The recent card displays only five rows, while the default layout does not show that card at all. Some transaction existence/account data is still used by getting-started guidance, so simply deleting those requests is not sufficient.

The budget request returns [full editor data](https://github.com/clroscott/BudgetApp/blob/febed517580795f788f7ba57ffb0a6526381ca1e/BudgetApp/BudgetApp.Application/Budgets/BudgetManagementService.cs#L491), including up to 12 months of history, the previous budget, and annual targets. Dashboard totals do not require that planning detail.

**Change:** a focused dashboard-summary endpoint/read service containing current budget totals/status, exact attention counts, setup/existence flags, and at most five recent records when requested. Reuse financial/visibility rules, not the heavyweight editor response. Keep current period/scope/currency labels and stale/failed feedback.

**Acceptance:** dashboard figures reconcile with monthly budget/drill-downs; hidden recent cards do not fetch 100 detailed transactions; correct results for no budget, zero records, viewers, mixed currencies, and private/shared expenses. Record request/query counts and payload size before/after. No cross-user or cross-household cache.

### PERF-05 — Make import-review reads and row commands proportional to the work

**Priority:** P2. **Evidence:** confirmed source. **Size:** large; split into several changes.

[ListDraftsAsync](https://github.com/clroscott/BudgetApp/blob/febed517580795f788f7ba57ffb0a6526381ca1e/BudgetApp/BudgetApp.Infrastructure/Imports/ImportRepository.cs#L71) retrieves every draft entity, including raw CSV JSON and original fields. [GetAsync/ToDetail](https://github.com/clroscott/BudgetApp/blob/febed517580795f788f7ba57ffb0a6526381ca1e/BudgetApp/BudgetApp.Application/Imports/ImportReviewService.cs#L48) builds every draft DTO and parses raw JSON to recover category labels. The client slices this response into pages of 100, so visual pagination does not bound network or server work.

A single correction/decision/removal loads the batch's tracked drafts and recalculates statistics. [refreshDetail](https://github.com/clroscott/BudgetApp/blob/febed517580795f788f7ba57ffb0a6526381ca1e/BudgetApp/budgetapp.client/src/pages/ImportReviewPage.tsx#L637) downloads the full detail again and then refreshes the import list. Changing detail also starts another categorization-rule preview across the batch.

**Change:** separate batch summary from filtered/paged draft projections; initially reduce redundant refresh/preview triggers, then target row commands and return updated row/summary data. Store or project imported category labels without repeatedly parsing every raw row on every read where feasible. Evaluate this against the added schema/API complexity before introducing a migration.

**Acceptance:** returned page size remains bounded as batch size grows; global statistics stay accurate. “All matching rows” bulk actions operate on the full matching set, not only the loaded page. Unsaved corrections survive hiding/reappearance/pagination, explicit category clearing, rule previews, and failed saves. Permission skips and completed-import read-only behavior remain intact. Preserve concurrency and completion safeguards rather than replacing them with client-calculated totals.

### PERF-06 — Reduce import-review render/update amplification

**Priority:** P2, profile first; coordinate with PERF-05. **Evidence:** confirmed update structure; browser timing unmeasured. **Size:** medium.

[Dirty updates](https://github.com/clroscott/BudgetApp/blob/febed517580795f788f7ba57ffb0a6526381ca1e/BudgetApp/budgetapp.client/src/pages/ImportReviewPage.tsx#L611) always allocate a new Map, including removal of a key that was already absent. Editing a draft propagates to the page; the 100 visible DraftRow components are not memoized. Several callbacks are recreated during page rendering. [Bulk preview](https://github.com/clroscott/BudgetApp/blob/febed517580795f788f7ba57ffb0a6526381ca1e/BudgetApp/budgetapp.client/src/pages/ImportReviewPage.tsx#L796) can traverse all matching rows on each parent render when a preset is selected.

**Change:** profile typing/filtering/bulk selection with 10,000 drafts and 100 visible rows. Add no-op state bailouts, stable row callbacks, cached derived values where useful, and memoized rows only if the profile justifies them. Extract draft-edit state coordination from presentation. Do not memoize everything or add virtualization before proving a benefit; only 100 rows are currently rendered.

**Acceptance:** compare React commit counts/time and browser long tasks while typing; unrelated unchanged rows should not do expensive work for each keystroke. Keep focus, keyboard access, error messages, cancellation, and every unsaved-change regression intact. React specifically recommends profiling and stable props before relying on memoization. [React memo guidance](https://react.dev/reference/react/memo)

### PERF-07 — Bound export memory and preserve safe cancellation

**Priority:** P2 for larger datasets, not first. **Evidence:** confirmed source. **Size:** medium.

[Export repository](https://github.com/clroscott/BudgetApp/blob/febed517580795f788f7ba57ffb0a6526381ca1e/BudgetApp/BudgetApp.Infrastructure/Transactions/TransactionRepository.cs#L120) buffers every matching transaction without a result limit. [CSV generation](https://github.com/clroscott/BudgetApp/blob/febed517580795f788f7ba57ffb0a6526381ca1e/BudgetApp/BudgetApp.Application/Transactions/TransactionCsvExportService.cs#L58) builds a StringBuilder, a full string, UTF-8 bytes, and a second BOM-prefixed array. The [browser download](https://github.com/clroscott/BudgetApp/blob/febed517580795f788f7ba57ffb0a6526381ca1e/BudgetApp/budgetapp.client/src/api/apiClient.ts#L98) buffers a Blob too. Larger/concurrent exports multiply memory demand.

**Change:** choose an explicit safe export-size policy and/or a streaming/paged writer. Never silently truncate. Preserve response/DbContext lifetime, cancellation, CSV formula-injection protection, escaping, BOM, stable ordering, all supported filters, and private-field redaction. Server streaming alone does not remove browser Blob buffering.

**Acceptance:** exports match list/report semantics and exact row counts; stress-test large exports and disconnections in isolation, measure peak allocations, and verify no corrupted partial download is advertised as complete. EF's guidance explains the memory difference between buffered and streamed results. [EF efficient querying](https://learn.microsoft.com/en-us/ef/core/performance/efficient-querying)

### PERF-08 — Reduce avoidable requests without weakening session security

**Priority:** P2/P3 after the data-path work. **Evidence:** confirmed request behavior; authentication-query savings need profiling. **Size:** medium.

[apiClient](https://github.com/clroscott/BudgetApp/blob/febed517580795f788f7ba57ffb0a6526381ca1e/BudgetApp/budgetapp.client/src/api/apiClient.ts#L63) fetches a fresh antiforgery token before every POST/PUT/DELETE/form request. Public read helpers do not accept AbortSignal. `usePageLoad` prevents stale results from being applied, but its cancellation is logical rather than actual network cancellation.

**Change:** consider identity-scoped antiforgery single-flight/reuse with explicit reset across login/logout/security changes, and optional cancellation for obsolete reads. Consolidate duplicated mutation-request construction without changing security/error semantics. Handle aborted reads separately from genuine connection failures. Never automatically replay uncertain writes.

[Cookie validation](https://github.com/clroscott/BudgetApp/blob/febed517580795f788f7ba57ffb0a6526381ca1e/BudgetApp/BudgetApp.Server/Program.cs#L87) deliberately checks the security stamp on every request. Email-confirmation middleware also looks up the user. The source alone does not establish how many extra SQL queries these lookups cause, because EF's tracked-user reuse may matter. Instrument request/query counts before considering request-scoped reuse.

**Acceptance:** parallel operations do not cause unnecessary token fetches; changing authenticated identity cannot reuse another identity's token; stale reads stop safely and do not overwrite current context. Keep CSRF validation, immediate security-stamp invalidation, verified-email gates, MFA proof checks, and role revocation behavior. Do not lengthen the validation interval or globally cache permissions as a performance shortcut.

## Cleanliness and reliability findings

### CLEAN-01 — Give CSS and the shared page shell clear ownership

**Priority:** P2, best cleanup candidate. **Evidence:** confirmed source. **Size:** medium, feature-by-feature.

`App.css` has 4,879 lines. More importantly, earlier [page layout rules](https://github.com/clroscott/BudgetApp/blob/febed517580795f788f7ba57ffb0a6526381ca1e/BudgetApp/budgetapp.client/src/App.css#L579) coexist with later [shared-shell overrides](https://github.com/clroscott/BudgetApp/blob/febed517580795f788f7ba57ffb0a6526381ca1e/BudgetApp/budgetapp.client/src/App.css#L4752). Many pages retain legacy headers that the shell now hides through CSS. This makes layout changes depend on the cascade and makes it harder to tell which component owns width, gutters, sticky bars, and header offsets.

**Plan:** retain the new shared layout variables; consolidate their canonical rules, then split styling by shell/shared controls/feature. Introduce a small shared page-frame convention to replace repeated hidden headers. Migrate one feature group at a time with no visual redesign. Extract shared z-index/overlay and sticky-offset conventions where actually shared; preserve measured footer clearance.

**Acceptance:** all page groups align identically; no footer/back-to-top/calculator/profile/tutorial overlap; desktop expanded/collapsed sidebar, narrow widths, 200% zoom, focus visibility, and tutorial IDs still work. Compare rendered screenshots. CSS line count alone is not evidence of slow browser rendering.

### CLEAN-02 — Split the largest coordinators at responsibility boundaries

**Priority:** P2/P3, preferably after fixing their hot paths. **Size:** medium per feature.

Large files include ImportReviewPage (1,346 lines), ImportReviewService (887), TransactionManagementPage (800), BudgetManagementService (774), YearlyPlanManagementPage (669), and DashboardPage (549). The issue is mixed coordination/presentation/domain-read responsibilities, not a numerical line limit.

**Plan:** start with import row editor, batch action controls, draft-cache coordination, and list/detail loading. Separate import read projections from command orchestration; extract duplicate matching as a focused, testable operation. Next separate transaction filter/report context from row editing, and dashboard customization from financial loading. Prefer plain functions and small hooks/services over generic repositories, a new state library, or a universal form framework.

**Acceptance:** split/refactor commits preserve behavior and contracts; existing characterization tests remain; no generic helper hides authorization, transaction boundaries, or financial rules. Smaller files should make future changes and debugging easier, not merely redistribute the same coupling.

### CLEAN-03 — Standardize context-owned async reads and refreshes

**Priority:** P2. **Evidence:** confirmed guard gaps; add race tests before fixing.

Newer pages use `usePageLoad` request sequencing, while older providers/action refreshes use different patterns. AuthProvider's general `refresh` directly applies its response; HouseholdProvider refresh has no latest-attempt guard. An older response can race a newer refresh or session transition. Import review's initial effects have guards, but its action `refreshDetail` does not: the import selector remains available while some actions/refetches run, so an old detail response can arrive after another import is selected.

The same page can also show [No imports yet](https://github.com/clroscott/BudgetApp/blob/febed517580795f788f7ba57ffb0a6526381ca1e/BudgetApp/budgetapp.client/src/pages/ImportReviewPage.tsx#L1078) after its initial list request fails: the error is set, loading ends, and the still-empty array selects the empty-state branch. Extend the reusable failed-versus-empty feedback pattern to this page rather than treating an unknown result as zero records.

This is a client-state reliability issue; it is not evidence that backend authorization is bypassed. The shell already remounts household pages using the household ID, which mitigates cross-household page-state reuse. Preserve that protection.

**Plan:** consistent user/household/import/context keys plus sequence guards; optional read cancellation from PERF-08. A successful write must remain recorded as successful if its later refresh fails. Never “solve” races by silently discarding dirty edits or repeatedly remounting forms on every refresh.

**Acceptance:** deferred-response tests for refresh A/B arriving in reverse order, logout during session refresh, user changes during household refresh, and import A action refresh arriving after import B selection. Test initial/refresh failure separately from a successful empty import list. No false success, stale overwrite, unsaved-data loss, or automatic duplicate write retry.

### CLEAN-04 — Make query-only navigation observable without stealing focus

**Priority:** P2, targeted correctness follow-up. **Evidence:** confirmed routing behavior; live reproduction pending.

[RouterProvider](https://github.com/clroscott/BudgetApp/blob/febed517580795f788f7ba57ffb0a6526381ca1e/BudgetApp/budgetapp.client/src/routing/RouterProvider.tsx#L23) publishes pathname only. Navigation/popstate to a different query on the same path calls `setPath` with the same value, so consumers are not notified. [Transaction filters/report context](https://github.com/clroscott/BudgetApp/blob/febed517580795f788f7ba57ffb0a6526381ca1e/BudgetApp/budgetapp.client/src/pages/TransactionManagementPage.tsx#L75) are initialized once from the URL.

**Plan:** expose a location/search change signal separately from page-path changes; explicitly define when URL filters should be restored. Keep route-focus/announcements keyed to real page transitions rather than ordinary filter changes. Do not replace the router wholesale as part of this fix.

**Acceptance:** same-path Back/Forward with different report/filter queries updates the intended context; canceled navigation restores history and preserves edits; ordinary filters/household/scope changes do not unexpectedly move focus. Existing drill-down reconciliation remains exact.

### Lower-priority candidates — measure or bundle with related work

- Search/export duplicate long visibility/inclusion predicates. Share SQL-translatable filter construction where the semantics truly match, but retain deliberate differences between report eligibility, visible records, and private-field redaction. Do not compile predicates into client-side filtering.
- Description search uses `ToUpper().Contains()`. Profile large filtered searches; ordinary indexes will not magically make arbitrary substring matching fast. Do not change search semantics or introduce full-text infrastructure without a demonstrated need.
- Reuse currency/date formatters in transaction/recurring/dashboard row rendering when profiling shows benefit. This is much less important than eliminating full-data reads.
- The displayed 512×512 logo mark is 286,746 bytes even when rendered around 40px; the 440×440 primary logo is 240,002 bytes. Consider appropriately sized/compressed variants, preserve image quality/accessibility, and measure cold-load payloads. Large unused media files were not counted as page-load costs.
- Pin the floating `Microsoft.AspNetCore.SpaProxy` version for build reproducibility. Check the actual compatible version during implementation rather than guessing it in this review.
- Refresh outdated architecture/development-status documentation as the corresponding code is refactored.

## What is already good and should stay

- Distinct domain/application/infrastructure/server boundaries; no evidence that replacing them would improve performance.
- Lazy-loaded page components and moderate production JS chunks; bundle size is not the strongest current bottleneck.
- Many read queries already use no-tracking and narrow projections. Transaction lists already page in SQL and aggregate currency totals in SQL Server.
- Existing transaction/import indexes, concurrency tokens, and unique import-row constraints.
- Broad automated coverage, interface regression cases, PR build/lint/test checks, and isolated test email/database infrastructure.
- Financial privacy checks and redaction; no optimization should turn personal data into a shared summary/cache.
- MFA/email-change flows deliberately use transactional serialization and expiring/limited challenges. SMTP delivery is outside their database transaction locks. This security complexity is purposeful; removing it is not a cleanup.
- SMTP uses encrypted delivery, certificate validation, per-delivery client ownership, and cancellation/timeouts. A slower email action may involve network/provider delay. Do not use fire-and-forget delivery or silently bypass MFA to appear faster. Durable outbox/pooling work can wait for a demonstrated need and hosting decisions.

## Proposed backlog and plan of attack

These are suggested board items; the board was not checked for existing overlaps, and no items were created. Each should include the safeguards and acceptance criteria from its matching finding above, plus the existing permanent QA checklist. No branch is needed merely to discuss this plan; implementation should use small dedicated branches.

| Order | Suggested board title | Covers | Scope boundary |
| ---: | --- | --- | --- |
| 1 | Make import duplicate matching and completion linkage scale linearly | PERF-01 | Algorithm only; no UI/API redesign |
| 2 | Keep all pending imports discoverable and dashboard counts accurate | PERF-02 | List paging/status + exact count |
| 3 | Aggregate monthly and annual budget actuals in SQL | PERF-03 | Read results unchanged; no calculation redesign |
| 4 | Load lightweight dashboard summaries | PERF-04 | Small response, privacy parity, no editor-history queries |
| 5 | Page staged import rows and target row refreshes | PERF-05 | Separate read contract and bulk semantics carefully |
| 6 | Streamline import-review draft state and rendering | PERF-06, import part of CLEAN-02 | Profile, then optimize; preserve dirty edits |
| 7 | Standardize async read ownership and failed/empty feedback | CLEAN-03, cancellation part of PERF-08 | Race/failure tests first; preserve dirty edits |
| 8 | Restore query-only navigation and filter history predictably | CLEAN-04 | History tests first; no broad router rewrite |
| 9 | Bound transaction-export memory use | PERF-07 | Explicit limits/streaming; no silent truncation |
| 10 | Reduce redundant antiforgery/session lookup work safely | remaining PERF-08 | Measure; no weakened security gates |
| 11 | Consolidate shared page layout and feature CSS | CLEAN-01 | Visual parity, accessibility/overlay regressions |
| 12 | Split remaining large page/service coordinators | remaining CLEAN-02 | One feature at a time, behavior-preserving |

A repeatable isolated profiling dataset should be established alongside items 1–3, not used as a reason to delay the already demonstrated algorithm fix. The larger import API work should not be combined into the first branch. Items 7, 8, and 11 can be moved earlier if race, history, or layout issues become user-visible priorities.

### Measurement and regression protocol

Use generated, disposable data rather than the user's real database. No SMTP delivery. Add fixtures for two users, multiple households, Owner/Admin/Member/Viewer roles, personal/household/shared expenses, legacy inclusion values, multiple currencies, zero records, inactive categories, and failed requests.

- Imports: 100/1,000/10,000 rows; sparse and dense candidates; all nonmatches, first/last matches, duplicate keys; more than 50 batches with old pending work.
- Financial reads: 1,000/10,000/100,000 transactions across multiple years; concentrated months and broad date ranges; exact decimal/refund/income/uncategorized cases.
- Record endpoint p50/p95, query count, returned rows, payload bytes, SQL logical reads/plans, and server allocations. Compare equivalent warm/cold conditions and Release builds on the same machine.
- Profile typing, filter changes, pagination, and bulk actions in a real browser; record React commits, long tasks, and memory. DOM-test wall-clock time is not a user interaction benchmark.
- Test write concurrency/retries and privacy separately from read speed. Never trade correctness for a faster average response.
- Keep structural guards (bounded page results, grouped SQL, no quadratic searches) in automated tests where practical. Store timing reports for comparison; avoid fragile universal millisecond gates until realistic targets are agreed.
- Run affected suites during each small change, then the full client/backend suites, lint, build, and permanent manual QA before merging. Keep CodeQL/dependency checks in place.

For this side project, start with items 1 and 2, then 3 and 4. A distributed cache, background-job system, generic application-state framework, full-text server, or wholesale architecture replacement is not justified by the evidence gathered here.

## Maintenance and development-speed implications

Runtime performance and time spent implementing a feature are different. Large coordinators, duplicate rules, inconsistent async conventions, and cascade-dependent styling increase the amount of code that must be understood and retested. Addressing those boundaries can make future work easier.

The current full tests completed in tens of seconds in this review, so their runtime alone does not explain an earlier approximately 45-minute MFA implementation. MFA legitimately crosses authentication, database concurrency, email, recovery, UI, and tests. We cannot reconstruct the exact time breakdown from this source review. Future features should be divided into explicit small outcomes with relevant targeted tests during iteration and a full final gate; do not remove the security checks or the final verification to save time.

## Completion status

Review and implementation plan complete. Findings were checked against their call sites, existing guards, and test/provider setup. No application fix, refactor, migration, deployment, production probe, email, or board edit was performed. The remaining browser/SQL Server measurements are deliberate follow-ups, not required approvals blocking this report.
