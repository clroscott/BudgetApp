# Shared layout ownership (#218, first delivery slice)

This is a behavior-preserving foundation, not the #201 visual redesign. The
transaction/import group now uses `PageFrame`; budgeting, dashboard, settings,
help and operator markup continue through an explicitly documented compatibility
bridge until their own migration slices. Do not close #218 after this slice.

## Style owners

`App.tsx` loads these in a deliberate order:

1. `App.css`: legacy feature styles for groups not migrated yet. It no longer owns
   shell, page-frame, transaction/import or shared section-navigation rules.
2. `styles/page-frame.css`: shared content max-width, gutters, vertical spacing,
   titles, named overlay layers, and the temporary legacy-page bridge.
3. `styles/shell.css`: desktop/collapsed/narrow navigation, household context and
   profile menu. The shell does not set individual feature widths.
4. `styles/shared-controls.css`: focus/skip link, live announcement, load feedback,
   section tabs and floating Back to top.
5. `styles/transactions.css`: transaction filters/editors, saved filters,
   categorization rules, uploads/previews, profiles and compact import review.
   It owns internal grids and readable upload-form width, not the page column.

Shared geometry has one owner. Add a feature-local layout inside the common
column; do not restore per-page max-width overrides or another late CSS patch.
The upload form remains left-aligned and limited to 52rem within the same page
column. Existing short settings/help forms remain 44rem through the bridge.

`PageFrame` supplies one main landmark and one content section. Pages keep their
existing section navigation, headings, control labels and stable tutorial IDs.
It has no data loading, navigation, permission or financial logic. The four
transaction/import headers previously hidden by the shell are no longer rendered.
The categorization-rules page uses the same convention.

## Sticky and overlay policy

At desktop width the context bar sticks at zero and the sidebar is a side rail.
At 55rem and below, the context bar sticks below the **measured** navigation/menu
height. `AppShell` observes that height, including wrapping and menu expansion;
window resize is a fallback. Hidden standalone-account navigation measures zero.
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

An existing monthly-budget period-control overflow is visible in the short
960px desktop/zoom case (1009px document width). The first slice does not worsen
it, and the transaction/import pages do not overflow the document. Fix the budget
period-control layout in the budgeting migration, not by changing all page widths.

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

## Remaining delivery order

- Budgeting: migrate monthly/annual/recurring/category frames and hidden headers;
  retire their conflicting legacy rules after rendered comparisons. Include the
  recorded period-control overflow and calculator/footer checks.
- Dashboard and settings/help/operator pages: migrate their markup and remove
  the corresponding compatibility bridge rules only after rendered comparisons.
- Continue #201 design proposals using these canonical layout owners. Broad
  visual enhancement does not require all legacy features to migrate first.

Each slice must retain privacy, accessibility, tutorial IDs and unsaved-change
guards, with the [permanent manual QA checklist](manual-qa-regression-test-plan.md).
