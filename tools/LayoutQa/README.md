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

# Focused calculator switching/dismissal/Use-result checks (fictional form state):
node .\tools\LayoutQa\verify-layout.mjs interactions budgeting
```

The `before` run must precede the source change. Both runs must use the same
browser version, fixture data, viewport definitions and host environment. Do not
overwrite the before evidence after editing to make a comparison pass.

Output lives under ignored `artifacts/layout-qa/before` and `after`:

- Full-page screenshots for each initial page/layout, plus scrolled review/budget.
- `measurements.json`: page column/title/tab/form geometry and document width.
- `pixel-comparisons.json` (after): exact changed-channel counts for initial
  screenshots. Review differences; rendering/anti-aliasing varies across machines.

The original first-slice evidence covers seven pages × five layouts. The current
harness covers sixteen page/state variants × five layouts (80 cases), including
the five budgeting destinations, loaded/empty/failed/delayed data, Viewer targets
and multiple-household selection. It waits for data-ready UI, not only a heading.
It also checks keyboard, profile, sticky-header and budget action/calculator behavior.
All pages must avoid document-level horizontal overflow; wide review/annual tables
retain their own scrolling area. The monthly/annual internal responsive grids can
change flow height; common column/title/tab/form geometry must otherwise match.
Different image sizes and pixel counts are recorded for visual review, not ignored.

The 960×540/2× case is a **200%-equivalent CSS viewport**, not an actual zoom or
screen-reader test. Complete the permanent manual checklist before merge. Future
feature migrations should add their pages and representative states here, keep
requests read-only, and capture fresh before evidence for that migration.
