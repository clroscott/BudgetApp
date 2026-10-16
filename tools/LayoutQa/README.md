# Read-only rendered layout regression harness

Run from the repository root with existing client dependencies and an
already-installed Playwright/browser. No packages, database, login credentials
or real email are needed. The Vite test server uses `127.0.0.1:4178`; if occupied,
the harness fails rather than stopping another process. It closes its own server
and disposable browser in `finally`.

The harness loads the actual app. All `/api` reads receive fictional fixtures.
Non-GET API requests and non-local requests are blocked and fail the run. Do not
replace these protections with a proxy to an application server.

If Playwright is not resolvable from this repository, provide the absolute path
to an existing Playwright `index.mjs` through `BUDGETAPP_QA_PLAYWRIGHT_PATH`.
Optionally set `BUDGETAPP_QA_BROWSER_PATH` to an installed browser executable;
otherwise Playwright uses its already-installed Chromium.

```powershell
node .\tools\LayoutQa\verify-layout.mjs before
# Make the focused layout change, then:
node .\tools\LayoutQa\verify-layout.mjs after

# Keep each later slice's before/after evidence separate:
node .\tools\LayoutQa\verify-layout.mjs before budgeting
node .\tools\LayoutQa\verify-layout.mjs after budgeting

# Remaining managed pages, with their own baseline:
node .\tools\LayoutQa\verify-layout.mjs before remaining
node .\tools\LayoutQa\verify-layout.mjs after remaining

# Reprocess already-captured evidence after a comparison-code correction:
node .\tools\LayoutQa\verify-layout.mjs compare remaining

# Focused calculator switching/dismissal/Use-result checks (fictional form state):
node .\tools\LayoutQa\verify-layout.mjs interactions budgeting
```

The `before` run must precede the source change. Both runs must use the same
browser version, fixture data, viewport definitions and host environment. Do not
overwrite the before evidence after editing to make a comparison pass.
`compare` starts no browser/server and cannot validate a later source change;
capture a new `after` run whenever application source or fixtures change.

Output lives under ignored `artifacts/layout-qa/before` and `after`:

- Full-page screenshots for each initial page/layout, plus scrolled review/budget.
- `measurements.json`: page column/title/tab/form geometry and document width.
- `pixel-comparisons.json` (after): exact changed-channel counts for initial
  screenshots. Review differences; rendering/anti-aliasing varies across machines.

The original first-slice evidence covers seven pages × five layouts. The current
default/budgeting harness covers sixteen page/state variants × five layouts (80 cases), including
the five budgeting destinations, loaded/empty/failed/delayed data, Viewer targets
and multiple-household selection. It waits for data-ready UI, not only a heading.
It also checks keyboard, profile, sticky-header and budget action/calculator behavior.
All pages must avoid document-level horizontal overflow; wide review/annual tables
retain their own scrolling area. The monthly/annual internal responsive grids can
change flow height; common column/title/tab/form geometry must otherwise match.
Different image sizes and pixel counts are recorded for visual review, not ignored.

The `remaining` slice covers 24 page/state variants × five layouts (120 cases):
dashboard, financial accounts, household/settings/activity, Help/Tutorials and
operator pages plus representative transactions/budgets. It includes signed-out
and no-household Help, settings without a household, Viewer/failed-load states,
and authorized/blocked operator views. Blocked views must make no admin-data reads.
Standalone Help's return link intentionally moves into the common title row; its
page column width/alignment remains fixed while header flow may change. Centered
public authentication/initial setup screens are not migrated by #218.

The 960×540/2× case is a **200%-equivalent CSS viewport**, not an actual zoom or
screen-reader test. Complete the permanent manual checklist before merge. Future
feature migrations should add their pages and representative states here, keep
requests read-only, and capture fresh before evidence for that migration.

## Read ownership and failure/retry checks (#214)

```powershell
node .\tools\LayoutQa\verify-read-ownership.mjs
```

This focused harness uses port `127.0.0.1:4179`, the same installed runtime/browser
configuration, and fictional GET-only responses. It covers five scenarios at
1440px and 390px: initial list failure, an empty list's refresh failure, rule-preview
retry, and late detail/list responses after switching imports. Request controls
are StrictMode-safe and wait for actual readiness, not guessed startup call counts.
API writes and external requests are blocked. Screenshots/read counts go to
ignored `artifacts/read-ownership-qa`. It closes its own server/browser on failure
and emits fictional-only diagnostics. It is not a production latency benchmark
or a substitute for the owner's manual acceptance sweep.

## Import paging and staged corrections (#212, #213)

```powershell
node .\tools\LayoutQa\verify-import-paging.mjs
```

Uses port `127.0.0.1:4181` and the installed runtime/browser configuration above.
Unlike the read-only harnesses, this test simulates saves, decisions and completion
inside intercepted fictional responses; no request reaches an application server.
It covers 100/1,000/10,000 staged rows at 1440px and 390px, bounded DOM/payloads,
safe row paging/filtering, preservation of corrections while staging budget choices,
targeted saves, approval and completion. Unknown API operations and external requests
fail closed. Screenshots and request evidence go to ignored
`artifacts/import-paging-ui-qa`.

## Import rendering profile (#213)

```powershell
# Capture before editing the application source:
node .\tools\LayoutQa\profile-import-rendering.mjs before
# After the focused change, using the same browser/environment:
node .\tools\LayoutQa\profile-import-rendering.mjs after
# Optional final verification capture (does not replace either capture):
node .\tools\LayoutQa\profile-import-rendering.mjs after-final
```

Uses port `127.0.0.1:4182`, 10,000 synthetic staged rows, 100 visible rows,
1440×900 and three repetitions. All API reads are intercepted; the only allowed
POST is a simulated read-only budget-choice preview. Real writes and external
requests are blocked. It injects development-only React Profiler/counters through
the disposable Vite server, never into saved application source. It records React
commit counts and duration, row renders, bulk-preview row visits and browser long
tasks for typing, filtering, choosing and staging a bulk preset. Browser/runtime
versions and raw samples go to ignored `artifacts/import-rendering-qa/<phase>`;
existing evidence is never overwritten. Run comparisons without competing tests.

This is an instrumented development/StrictMode interaction profile, not production
latency or a DOM-test timing gate. `elapsedMs` includes deliberate typing delays
and settling time. Keep regressions and remaining long tasks visible in the
[measured results](../../docs/import-review-rendering-performance.md); do not use
machine-specific millisecond assertions as unit tests. Functional browser checks
and the owner's manual keyboard/focus sweep remain separate requirements.

## Refined interface (#201)

```powershell
node .\tools\LayoutQa\verify-refined-ui.mjs before
# Apply the focused design slice, then:
node .\tools\LayoutQa\verify-refined-ui.mjs after
# A separate final capture after any repairs:
node .\tools\LayoutQa\verify-refined-ui.mjs after-final
```

Uses port `127.0.0.1:4184` and the same installed browser/runtime configuration.
Seven real pages across eight layouts cover desktop/collapsed, 880/800/760px,
390/320px and the 200%-equivalent short viewport. It verifies common content
alignment within each layout, bounded document width, profile focus return,
Menu/Skip behavior, import-column containment and non-overlapping budget actions.
After captures also check Georgia headings, missing-file disabling and client-side
oversized-file feedback without any upload. Every API response is fictional and GET-only;
external requests and writes are blocked. Initial screenshot geometry and fonts
are stored under ignored `artifacts/refined-ui-qa/<phase>`; completed evidence is
never overwritten. Before/after visual changes are intentional, not a pixel-equality
gate. Read [scope and remaining mobile/manual checks](../../docs/ui-enhancement.md).

## Mobile interface (#201)

```powershell
node .\tools\LayoutQa\verify-mobile-ui.mjs before
# Apply the mobile changes, then:
node .\tools\LayoutQa\verify-mobile-ui.mjs after
# Check final fields, menu stacking, action clearance and calculators:
node .\tools\LayoutQa\verify-mobile-ui.mjs interactions
```

Uses port `127.0.0.1:4190` and the same installed Playwright/browser environment
variables as the other harnesses. Captures three baseline pages on desktop/phone;
the after run covers 18 pages at 1440px, touch 390/320px, short 844×390 landscape,
880px tablet and 960×540/2× zoom-equivalent. Desktop dashboard, review and budget
screenshots must remain pixel-identical to their baseline. Checks bounded document
width, active tab visibility, menu size/non-displacement, Escape/focus return,
outside dismissal and Skip. Only fictional GET responses are allowed; no real
database, credentials, email or writes. Evidence is ignored under
`artifacts/mobile-ui-qa`. Real devices/zoom/keyboard and screen-reader QA remain
manual requirements. Do not overwrite baselines after changing source.
The interactions mode covers monthly/annual actions in all six layouts, including
last-field hit testing and calculator Escape/focus return. An optional final
argument (for example `small-phone`) restricts a diagnostic rerun to one layout.

## Import undo (#113)

`node .\tools\LayoutQa\verify-import-undo-preview.mjs` uses the same installed
Playwright/browser environment variables as the other harnesses. Port 4192;
1440/390/320px; eligible, blocked, failed-read/retry, lost-response and Viewer cases.
It verifies read-only preview wording, confirmed undo, blocked actions, status
reconciliation, local table scrolling and bounded page width. API responses are fictional
fixtures; only the expected undo POST is intercepted and simulated (never forwarded).
Other writes/external requests fail closed. Screenshot evidence goes
to ignored `artifacts/import-undo-preview-qa`. This checks confirmation, status
reconciliation and layout, not a real database command or manual QA in
`docs/manual-qa-regression-test-plan.md`.

## Guided import tutorial (#253)

`node .\tools\LayoutQa\verify-import-tutorial.mjs` uses the same Playwright/browser
environment variables. Port 4193; 1440/390/320px; CSV, Excel, custom mapping,
existing Completed, denied Viewer, failed staging, duplicate-file rejection and
lost-completion cases. Scrolling tests check ring geometry across the coach and
within the row grid; failures verify the floating notice and undimmed task.
All API requests are fictional intercepted responses, including progress and
explicitly user-operated financial actions. Unexpected writes/external requests
fail closed; no real database, XLSX parser or email delivery is exercised.
It checks outcome gates, no command replay, context-preserving completion, dimmed
spotlights, fixed-coach bounds and bounded page width. Evidence is ignored under
`artifacts/import-tutorial-qa`. See docs/import-tutorial.md and permanent manual QA
for real keyboard/screen-reader/zoom, privacy and live workflow acceptance.
