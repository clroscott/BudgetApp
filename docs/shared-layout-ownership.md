# Shared layout ownership (#218, delivery slices 1–2)

This is a behavior-preserving foundation, not the #201 visual redesign. The
transaction/import and budgeting groups now use `PageFrame`. Dashboard, settings,
help and operator markup continue through an explicitly documented compatibility
bridge until their own migration slices. Do not close #218 after these slices.

## Style owners

`App.tsx` loads these in a deliberate order:

1. `App.css`: legacy feature styles for groups not migrated yet. It no longer owns
   shell, page-frame, transaction/import, budgeting or shared section-navigation rules.
2. `styles/page-frame.css`: shared content max-width, gutters, vertical spacing,
   titles, named overlay layers, and the temporary legacy-page bridge.
3. `styles/shell.css`: desktop/collapsed/narrow navigation, household context and
   profile menu. The shell does not set individual feature widths.
4. `styles/shared-controls.css`: focus/skip link, live announcement, load feedback,
   section tabs and floating Back to top.
5. `styles/transactions.css`: transaction filters/editors, saved filters,
   categorization rules, uploads/previews, profiles and compact import review.
   It owns internal grids and readable upload-form width, not the page column.
6. `styles/budgeting.css`: monthly budgets, annual targets/overview, recurring
   expenses, category management and calculator controls. Internal grids wrap
   within the available page column; fixed budget actions use the shared geometry
   tokens and the page's measured action-height clearance.

Shared geometry has one owner. Add a feature-local layout inside the common
column; do not restore per-page max-width overrides or another late CSS patch.
The upload form remains left-aligned and limited to 52rem within the same page
column. Existing short settings/help forms remain 44rem through the bridge.

`PageFrame` supplies one main landmark and one content section. Pages keep their
existing section navigation, headings, control labels and stable tutorial IDs.
It has no data loading, navigation, permission or financial logic. The four
transaction/import headers previously hidden by the shell are no longer rendered.
The categorization-rules page uses the same convention.

Monthly budget, Annual targets, Annual overview, Recurring expenses and Categories
now follow that convention too. `PageFrame` accepts a page ref/class and an optional
footer outside the content section so measured monthly actions retain their
existing positioning and Back-to-top portal. These are layout-only props.

## Sticky and overlay policy

At desktop width the context bar sticks at zero and the sidebar is a side rail.
At 55rem and below, the context bar sticks below the **measured** navigation/menu
height. `AppShell` observes that height, including wrapping and menu expansion;
window resize is a fallback. Hidden standalone-account navigation measures zero.
Navigation-group expansion also remeasures when ResizeObserver is unavailable;
unchanged heights do not generate repeated style mutations.
This fixes the former narrow-screen context bar being covered by Menu on scroll.

Named layers preserve the existing order: Back to top 10, context 15, sidebar
and budget actions 20, calculator 40, tutorial 10000, skip link 11000. Profile
content remains in its context-header layer; tutorial spotlight/coach layers are
local to the tutorial. This does not introduce a new modal/focus policy.

Budget action width now uses the same sidebar/gutter tokens. Existing measured
`--budget-actions-height` clearance and the Back-to-top portal remain unchanged.
Do not replace measured clearance with a guessed fixed footer height.

## Verification and limitations

The read-only synthetic harness in `tools/LayoutQa` renders the actual app with
all API reads intercepted. Mutations and external requests are blocked. It
captures before/after screenshots and compares content, heading, tab and form
geometry for seven pages across five layouts (35 cases): expanded/collapsed
1440px desktop, 880px breakpoint, 390px narrow, and a 960×540 CSS viewport with
2× pixel density representing a short 1920px desktop at 200% zoom.

It also checks profile-menu Escape/focus return, narrow Menu/Skip-to-content,
Back to top inside monthly budget actions, calculator Escape/focus return, and
absence of retired headers. Real browser zoom and screen-reader announcements
still require the permanent manual checklist; an emulated viewport is not a
screen-reader test. Screenshot pixel differences are review evidence, not a
cross-machine anti-aliasing test gate.

The second slice fixes the recorded monthly period-control overflow and annual
target-row overflow. Their grids wrap to the actual available width instead of
forcing minimum tracks beyond the page column. This changes internal row heights
and control widths, not the common heading/tab alignment or financial calculations.

New automated coverage guards style ownership, PageFrame landmarks/input/target
preservation, measured navigation height/cleanup, and focus with the new content
class. Existing financial, permission, tutorial and unsaved-change tests remain
part of the regression suite. No database migration or production configuration
change is needed.

Verification on October 8, 2026: 526 client tests, 628 backend tests, client lint
and production build pass. All 35 rendered geometry cases pass. Twenty-three
initial screenshots are pixel-identical; the other twelve differ only in the
narrow/breakpoint shell-header region (rows 13–127), with unchanged page geometry
and visually unchanged header controls/text. Scrolled narrow screenshots confirm
the intended context-bar stacking correction. Browser zoom/screen-reader and
real interactive financial-flow checks remain pending with the user.

The second-slice harness captures a separate baseline under
`artifacts/layout-qa/budgeting`; it never replaces the first-slice evidence. It
waits for representative loaded records before screenshots and adds the four
other budgeting pages plus empty/failed budgets, delayed annual data, Viewer
targets and multiple-household selection (80 cases across five layouts).
Page columns, headings, section tabs and upload-form alignment are compared;
intentional budgeting flow-height changes are allowed and all pages must avoid
document-wide horizontal overflow. Image dimension/pixel differences are retained
for review, not treated as proof of accessibility or unchanged financial behavior.

Verification on October 9, 2026: all 542 client tests, client lint and production
build pass. All 80 rendered comparison cases pass; 60 initial screenshots are
pixel-identical. The other 20 are monthly/annual-target internal-grid changes;
the previously recorded document overflow is gone. No backend, database or
production configuration was changed in this slice. Actual browser zoom,
screen-reader and real interactive save/allocation QA remain manual checks.
Ten focused browser cases also pass calculator switching, outside dismissal,
Close/focus return and Use result near the monthly/annual page footer. They change
only fictional local form values; no API writes are permitted by the harness.
The annual save bar also supplies a Back-to-top host; its action buttons wrap
together instead of letting a separate floating button overlap Save. Regression
coverage checks containment, non-overlap and scrolling without clearing edits.

## Remaining delivery order

- Dashboard and settings/help/operator pages: migrate their markup and remove
  the corresponding compatibility bridge rules only after rendered comparisons.
- Continue #201 design proposals using these canonical layout owners. Broad
  visual enhancement does not require all legacy features to migrate first.

Each slice must retain privacy, accessibility, tutorial IDs and unsaved-change
guards, with the [permanent manual QA checklist](manual-qa-regression-test-plan.md).
