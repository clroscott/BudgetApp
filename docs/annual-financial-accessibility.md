# Annual financial accessibility (#179)

This updates the Annual overview category breakdown and the Annual targets
household fiscal-year default. It does not change financial calculations,
authorization, stored targets, or monthly allocation. No database migration is
needed.

## Category performance

The breakdown is a native table with a caption identifying scope, calendar year,
and currency. Category names are row headers; Budgeted, Actual, Remaining, and
Average actual per month are column headers. Every amount cell explicitly
references both its category header and its measure header. Header IDs are unique
even when category names are duplicated.

Each root category and its descendants form a table body group. Existing tints,
parent emphasis, and indentation remain visual aids, not the only explanation:

- Children say `Subcategory of` with their ancestor path.
- Root totals with children say `Includes subcategories`. They already include
  descendant amounts; do not add the root total to its child rows.
- Deactivated categories retain their visible status and transaction links.
- Missing budget amounts say `No budget`; saved zero amounts retain their
  formatted zero and say `Zero budget`.
- Remaining without a budget says `Not available — no budget`.
- Negative actual/average amounts retain the signed currency amount and say
  `Negative amount`; negative remaining says `Over budget`.

All numbers come directly from the existing report response. Category links keep
the existing year, budget-inclusion scope, currency, spending, category, and
household report context. The report does not write data.

At narrow widths the table scrolls within its own named, keyboard-focusable
region. Its help text explains sideways scrolling and arrow keys. Headers are
not hidden, and table rows are not converted to generic grid/flex elements.
The enclosing report grid uses a shrinkable column so the wide table does not
widen the entire page.

## Fiscal-year default

The existing selector has a visible associated label, `Default fiscal-year
starting month`, distinct from the selected plan's `Fiscal year begins` control.
Its associated description explains that the default chooses the initial month
for unsaved plans, while saved annual plans and existing monthly budgets stay
unchanged.

The control stays in its current location and uses the same household-default
endpoint, permissions, and unsaved-change handling. There is no duplicate
settings source. Any later relocation belongs to Household settings (#138).

## Verification

`AnnualAccessibility.test.tsx` has 13 regression cases covering native semantics,
header references, grouping/hierarchy, missing versus zero budgets, signed
amounts, deactivated/long/duplicate names, both scopes' links, empty categories,
partial-year explanation, keyboard scroll-region access, default labeling,
read-only permissions, and the existing one-write default save behavior.

An isolated Chromium preview rendered the actual pages/CSS using sample API
responses with no database or email access. Desktop and a 390px frame were
checked, including long category names, visible focus, arrow-key horizontal
scrolling, and the default label/description. This exposed and verified the fix
for whole-page overflow at narrow widths. The temporary preview was removed.

Actual 200% browser zoom and live screen-reader speech/table navigation still
require manual sign-off. DOM tests and an accessibility-tree inspection do not
establish those behaviors or general accessibility conformance. Run the permanent
[annual accessibility QA cases](manual-qa-regression-test-plan.md#annual-financial-accessibility-regression-179)
in Development/Scratch before signing them off.

The semantic pattern follows W3C guidance for
[tables with row and column headers](https://www.w3.org/WAI/tutorials/tables/two-headers/),
[table row groups](https://www.w3.org/WAI/tutorials/tables/irregular/), and
[associated form instructions](https://www.w3.org/WAI/tutorials/forms/instructions/).
