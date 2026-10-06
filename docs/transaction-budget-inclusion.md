# Transaction budget inclusion

## One transaction, separate budgets

On Import Review and Transactions, **Include in budgets** has two choices:

- **My personal budget** includes the full amount in the signed-in user's Personal actuals.
- **Household budget** includes the full amount in Household actuals.

Select either, both, or neither. There is still one transaction, source account,
amount, date, category, and import reference. This is inclusion, not allocation:
CAD 1,200 rent selected for both contributes CAD 1,200 to each scope, not CAD 600.
Do not sum overlapping Personal and Household reports as a combined total.

Monthly budgets, annual targets, and recurring plans remain independent. Changing
inclusion changes actuals, annual income/spending/net cash flow, and historical
actuals immediately, including actuals displayed for Closed months. It does not
change planned amounts, statuses, account balances, or transaction amounts.
Annual net cash flow is a selected-budget-scope calculation, not a bank balance.

## Defaults and import review

- Household-account rows initially count in Household only.
- Personal-account rows initially count in the account owner's Personal budget only.
- Review rows can override these defaults before approval/completion. Bulk **Save
  all corrections** persists the same choices as an individual save.
- **Bulk budget inclusion**, below the row filter, sets Personal only, Household
  only, Personal + Household, or neither for all matching rows across pages or
  just the current page. The preview counts changed, unchanged, and skipped rows.
  Confirm **Apply budget choices**, then use **Save all corrections**. Existing
  date/amount/description/category corrections are kept. Excluded rows, linked
  transactions, and rows protected by another reviewer's Personal choice are
  skipped; Household permission restrictions are respected. Saving changed
  approved rows returns them to Pending so they can be reviewed again.
- **Exclude row** still means do not create a transaction. Selecting neither
  budget creates an approved transaction which remains in the ledger but not in
  budget actuals. These are different operations.
- Category rules change categories, not budget inclusion. Duplicate detection
  remains based on source transaction identity, not its inclusion choices.
- Completing an import a second time does not create additional transactions.

A staged row can select one reviewer's Personal budget. Another reviewer cannot
overwrite that person's choice. After completion, each member who can see the
transaction can independently select their own Personal budget; those choices
are stored per user. Completing an import does not assign Personal inclusion to
the completer instead of the reviewer who selected it.

## Privacy and authorization

Account scope controls account access; budget inclusion does not share an account.
Personal-budget plans and membership choices remain private to their user.

Including a personal-account transaction in Household explicitly shares its
transaction date, amount, currency, category, description, source, and review/void
state. Other household members see **Shared expense (private account)** instead
of an account ID/name. Posted date, merchant, notes, institution/account details,
original CSV text, and import files remain private. Choose a description suitable
for the household before sharing.

- Active membership in the selected household is required for all reads/writes.
- Only the personal-account owner can change its financial details or Household
  inclusion. A Household Viewer cannot change Household inclusion, including for
  their own personal account.
- A member, including a Viewer, may change only their own Personal inclusion on
  a transaction they can already see. This does not change shared financial data.
- Household-account financial edits retain the existing Editor/Admin/Owner rules.
- Removing Household inclusion from a private-account transaction hides it from
  other members and removes it from their Personal actuals, even if they had
  selected it previously. Their stored choices never grant access to private data.
- Household audit events for private-source sharing/edits contain only safe
  shared information. Personal inclusion changes are personal audit events.

Inclusion saves use the transaction's update timestamp. Stale saves return a
conflict instead of overwriting another user's changes. The editor offers a
reload action and preserves failed/unsaved choices until explicitly discarded.

## Reports, search, and export

Monthly actuals, prior-month/history columns, and annual overview calculations use
explicit inclusion rather than account scope. Currency mismatch and category
root/subcategory rules still apply; voided and budget-excluded records do not
contribute to actuals. Expense refunds remain negative spending.

Transactions supports All visible, My personal, Household, Personal + Household,
and Not included in my budgets filters. Budget filters omit voided rows; All
visible preserves the ledger view. Another user's Personal choice is never a
search criterion. Search pagination and CSV export return each transaction once.
CSV includes **Included in Budgets** for the current viewer, and redacts private
source details the same way as the list.
The visible excluded flag also reflects only that viewer's budgets, not another
member's private Personal inclusion. Financial edits leave inclusion untouched.

Annual spending/category/month links retain budget scope, currency, date range,
category, and spending semantics. Transactions displays those filters so they can
be inspected or changed. A combined reporting mode, split amounts, seasonal
allocations, and changing another user's Personal inclusion are not part of #182.
Recurring plans remain single-scope and do not create actual transactions.

## Persistence and rollout

Migration: `20261006034920_AddTransactionBudgetInclusion`.

It adds a Household inclusion flag, per-user transaction Personal memberships,
and staged-row inclusion fields. It backfills existing data from account scope:
Household stays Household; Personal stays with its owner; previously excluded
transactions remain excluded. No historical transaction automatically becomes
shared or counts in both. Existing drafts retain their old account defaults.

The nullable Household flag supports old domain factory callers/test fixtures
until inclusion is initialized. Imported transactions and migrated records have
explicit choices. Account-scope edits do not silently reclassify those records.
The legacy global exclusion flag remains for compatibility, but configured rows
must use the dedicated inclusion endpoint to change budget treatment; an old
financial-edit request cannot silently replace these choices.

Apply the migration to Development/Scratch before testing this build. Follow the
[Production deployment checklist](local-production-deployment-checklist.md) for
backup, idempotent script generation, rehearsal, and deployment. Never use an
unreviewed direct database update against Production. Rolling back this migration
drops inclusion choices; a verified pre-upgrade backup is the recovery path.

From the repository root, for **Development only**:

```powershell
Set-Location 'C:\Users\clayb\source\repos\clroscott\BudgetApp'
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:DOTNET_ENVIRONMENT = 'Development'
$env:ConnectionStrings__BudgetApp = 'Server=BIG-Z\SQLEXPRESS;Database=BudgetAppDb_DEV;Integrated Security=True;TrustServerCertificate=True;'
dotnet tool restore
if ($LASTEXITCODE -ne 0) { throw 'Tool restore failed.' }
dotnet tool run dotnet-ef database update --project '.\BudgetApp\BudgetApp.Infrastructure\BudgetApp.Infrastructure.csproj' --startup-project '.\BudgetApp\BudgetApp.Server\BudgetApp.Server.csproj' --connection $env:ConnectionStrings__BudgetApp
if ($LASTEXITCODE -ne 0) { throw 'Development database update failed.' }
```

These variables affect this PowerShell process and its children only. This feature
does not require SMTP changes. The implementation process does not apply the
migration to either the Development or Production database automatically.

## QA

Automated coverage includes domain choices, per-user independence, real API
authorization/redaction, conflict handling, import completion, migration backfill,
monthly/history/annual reconciliation, refunds/currency/void/exclusion rules, and
client unsaved-change/save/link behavior. Complete the **Transaction budget
inclusion** section of the [living QA plan](manual-qa-regression-test-plan.md)
with two accounts before release, including Draft/Active/Closed months.
