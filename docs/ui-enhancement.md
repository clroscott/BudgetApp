# Refined interface (#201, first implementation slice)

## Approved direction

The owner approved the warm sidebar concept on 2026-10-14: retain a sidebar,
use Georgia for headings, keep a clean sans-serif for
controls and dense data, use warm neutral surfaces/evergreen actions, and reduce
heavy framing. This follows #218's shared layout ownership; it is not a second
late-loading theme stylesheet or a financial-model change.

On 2026-10-15 the owner selected Hybrid typography: retain Georgia headings but
use Segoe UI/system sans-serif for financial totals, with lining and tabular
numerals. This avoids Georgia's uneven-height old-style digits.

The first implementation slice supplies the shared design foundation, grouped
navigation, the real dashboard summary presentation, and action-error visibility.
It is not a claim that all of #201 or the separate mobile design review is done.

## Shared design owners

- `index.css` owns palette, body/display font stacks and control/panel radii.
  Georgia and Segoe UI/system fallbacks require no external font downloads.
- `App.css` owns shared form/button/link/feedback/brand styling.
- `page-frame.css` remains the only owner of content width, gutters and shared
  page-title alignment. Its geometry has not been forked by feature.
- Existing feature styles use the common panel radius and lighter shadow tokens.
  Inputs, currency editing, dense transaction/import rows and table values remain
  sans-serif. Large dashboard, annual summary and budget action totals use the
  shared numeric font token with lining, tabular numerals.
- `shell.css` owns the retained desktop/collapsed/narrow navigation and context
  header. Sidebar sections are Day to day, Manage and Support; all six existing
  destinations and their secondary routes remain. Tutorial IDs, active-page
  semantics, per-user collapse preference and measured menu offsets are unchanged.

## Dashboard and data boundaries

The canonical three-card/three-column arrangement gets a full-width financial
overview followed by Needs attention and Quick actions. Other saved panel orders
and column choices keep the grid arrangement; customization uses uniform cards
for the existing drag/Earlier/Later behavior. No preference is rewritten by viewing
the page, and cards are not automatically added or removed.

Totals still come from the focused dashboard-summary endpoint. Scope, currency,
month, status, No budget, uncategorized amounts, mixed-currency warnings, stale
data, failed reads and permission wording remain explicit. No decorative totals,
fake category values, new financial queries or financial writes were introduced.
The mockup's illustrative category breakdown is not hard-coded into the app or
implemented by fetching the full budget editor; any future breakdown needs its
own appropriately bounded summary data.

## Action feedback

`ErrorSummary` has an opt-in `revealOnChange` for action-driven errors in upload,
import review, monthly budgets and dashboard layout saves. If a new explanation
would be outside the viewport or obscured by the sticky header, it uses the
existing page-focus helper to reveal and focus that explanation. It is not a
disappearing toast or a new modal. Values, confirmations and retry rules stay intact.

Visible feedback does not move focus. Rendering the same error again does not
repeat the focus movement. Other pages/read/filter errors retain the default
announcement-only behavior unless explicitly opted in; generic read failures do
not receive a new global autofocus policy.

## Mobile baseline and next review

The current narrow Menu behavior is retained, not replaced by a speculative new
drawer. Inputs/selects retain readable narrow-screen text, touch controls receive
minimum target sizing, wide financial grids keep local horizontal scrolling, and
budget actions retain measured clearance and their Back-to-top host.

The next mobile review should settle menu/context-header space, dashboard card
density, filter/action grouping and the best small-screen review workflow. Do
not hide household/scope context, financial columns, privacy warnings or save
actions merely to fit a screenshot. Test real touch keyboards, device zoom and
screen-reader focus in addition to the fixture-driven checks below. Dark mode
was a mockup preview capability, not an added application setting in this slice.

## Verification

`tools/LayoutQa/verify-refined-ui.mjs` captures before/after screenshots and geometry
for seven real pages across eight layouts: desktop, collapsed sidebar, 880/800/760px,
390/320px and a short 960×540/2× zoom-equivalent viewport. It checks common alignment,
document overflow, fonts, profile Escape/focus return, Menu/Skip, grid containment,
and budget/annual action non-overlap. The final run also verifies missing-file
disabling and exercises oversized-file feedback from the bottom of the page
without issuing an upload request.
All API responses are fictional GET-only fixtures; writes/external requests fail
closed. Evidence is ignored under `artifacts/refined-ui-qa`; the before capture is
not overwritten. Intentional visual differences are reviewed, not pixel-equality
requirements. Emulated viewports do not prove real 200% zoom or screen-reader QA.

The permanent [#201 manual cases](manual-qa-regression-test-plan.md#refined-interface-201)
remain unchecked until a human performs them. Keep this issue open for further
page-specific polish and the requested mobile iteration.

Verification on 2026-10-14: 648 frontend tests and 677 backend tests passed;
TypeScript/Vite production build and client lint passed (existing lint warnings
remain). All 56 page/layout cases passed before and after the changes. The final
capture also passed eight local upload-rejection visibility checks without API
writes. Browser artifacts are under `before` and `after-final`; the intermediate
`after` capture is not the final verification source.
Ten additional calculator switching/dismissal/Use-result and fixed-action cases
passed with fictional local form values under `artifacts/layout-qa/refined-ui`.
