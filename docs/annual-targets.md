# Annual targets and monthly allocation

BudgetApp annual targets are a planning layer above the existing independent
`BudgetMonth` and `BudgetLine` records. They are targets, not actual spending,
remaining balances, or continuously synchronized monthly budgets.

## Fiscal years

Each household has a default fiscal-year start month. January is the default.
The UI names a fiscal year by its starting year and always shows its complete
date range. For example, FY 2027 with an April start covers April 1, 2027 through
March 31, 2028.

Each `YearlyPlan` stores its own fiscal start month. Changing the household
default affects only plans that have not yet been saved.

Before first save, the annual-target page shows a **Fiscal year begins** selector
beside the starting year. Changing it immediately updates the displayed date
range. The month can also be changed later after explicit confirmation. That
changes the annual plan's date range and future allocations only; existing
monthly budgets are never moved, deleted, or changed.

## Scope and privacy

A plan is unique by household, starting year, scope, and optional personal
owner:

- Household plans have no owner and follow household view/edit permissions.
- Personal plans belong to the signed-in user and are never returned as another
  member's personal plan.

The plan currency is also snapshotted from the household when the plan is first
saved.

## Category targets

An annual target line can be attached to an active household expense category.
Within each root section, a plan may use either:

- one overall root-category target; or
- one or more detailed subcategory targets.

It cannot use both modes in the same section. A missing line means no annual
target was defined; a saved zero is an explicit zero target.

The equivalent monthly and quarterly amounts displayed in the annual-plan UI
are guidance. They show the annual target divided by 12 and 4 respectively.

## Creating monthly drafts

Users choose any combination of the 12 fiscal months using individual
checkboxes or Select all/Select none controls. One action creates exactly the
selected monthly Drafts. Allocation uses cents and distributes any remainder
deterministically according to each month's fiscal position, so the complete
12-month allocation adds back to the annual target exactly.

Before confirmation, the UI lists all 12 fiscal months and labels each one as a
new Draft, an existing Draft that will be kept or replaced, or a protected
Active/Closed budget.

By default:

- missing monthly budgets are created as Draft;
- existing Draft, Active, and Closed budgets are skipped;
- the result reports every created and skipped month.

The user may explicitly choose to replace existing Draft lines after a
confirmation. Active and Closed budgets are never replaced by annual
allocation.

Generated monthly budgets are independent copies. Editing a monthly budget does
not change the annual plan, and later annual-plan edits do not silently update
any month.

The monthly-budget planning metrics show the exact monthly allocation from the
saved plan whose fiscal date range contains the selected month. Remainder cents
therefore match what annual allocation would copy into that particular month.
Detailed targets appear on their subcategories and roll up for the root section.
If no covering plan or category target exists, the UI displays an em dash rather
than assuming zero.

## Database migration

Migration `20260730200730_AddYearlyPlans` adds:

- `Households.FiscalYearStartMonth`;
- `YearlyPlans`;
- `YearlyTargetLines`.

Apply it first to `BudgetAppDb_DEV`. Production deployment requires the normal
backup, migration rehearsal, deployment, and verification checklist.
