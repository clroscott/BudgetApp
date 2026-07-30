# Principal Workflows

## Purpose

This document describes the main BudgetApp user workflows before they are split into implementation issues. It keeps page behavior, validation, persistence, recovery, and permissions aligned with the core data model.

Each workflow uses the same structure:

1. Starting state
2. Main steps
3. Validation
4. Records created or updated
5. Failure and recovery behavior
6. Permissions

## Application Areas

The provisional authenticated navigation is:

- Dashboard
- Transactions
- Import
- Budgeting
  - Monthly Budget
  - Recurring Expenses
  - Forecast
- Reports
- Accounts
- Household
- Settings

Categories, categorization rules, merchant aliases, and import profiles are secondary management areas. They should be available contextually from the workflows that use them rather than being hidden exclusively in Settings.

## 1. Register and Create a Household

### Starting state

- The visitor is not authenticated.
- Registration is enabled.

### Main steps

1. The visitor enters account credentials and a display name.
2. The application creates the Identity account.
3. The user signs in or is signed in after confirmation, depending on the selected Identity flow.
4. The user enters a household name and basic defaults such as currency and time zone.
5. The application creates the household and makes the user its Owner.
6. The user is directed to initial setup or the Dashboard.

### Validation

- Identity validates email, password, and account uniqueness.
- Household name is required and length-limited.
- Currency and time zone must be supported values.
- Retried household creation must not create duplicate memberships accidentally.

### Records created or updated

- Identity User
- Household
- HouseholdMember with Owner role and Active status
- Default household categories, if seeding is part of initial setup

### Failure and recovery behavior

- If user creation fails, no household is created.
- If household creation fails after registration, the authenticated user returns to household setup.
- Retrying setup should resume safely without creating a second owner membership.

### Permissions

- Anonymous users may register.
- Only an authenticated user without a completed household setup may create their initial household through this flow.

## 2. Invite a Household Member

### Starting state

- The current user is authenticated and belongs to a household.
- The current user has permission to manage members.

### Main steps

1. The user opens Household management.
2. The user supplies the invitee's email and selects an initial role.
3. The application creates a pending HouseholdInvitation and sends its link
   through the configured backend email sender.
4. The invitee follows the invitation and signs in or registers.
5. The invitee accepts the invitation.
6. The membership becomes Active.

### Validation

- Email and role are valid.
- The household does not already have an active or pending membership for that user/email.
- The inviter cannot assign a role above their own authority.
- Accepting user identity must match the invitation.

### Records created or updated

- HouseholdInvitation with a hashed token
- Identity User, if the invitee registers
- Active HouseholdMember and invitation acceptance details upon acceptance

### Failure and recovery behavior

- Pending invitations can be resent or revoked.
- Expired or revoked invitations cannot be accepted.
- A failed registration does not activate the membership.
- A failed email delivery leaves a retryable pending invitation.
- A non-Owner may leave their current household before accepting.
- A sole Owner may delete an unused, unchanged household before accepting.
- Financially active or customized households cannot be deleted through this
  recovery flow.

### Permissions

- Owners may invite Admin, Editor, or Viewer members.
- Admins may invite Editor or Viewer members.
- Viewers and Editors cannot manage invitations.
- Owners cannot leave until ownership can be transferred or their unused
  single-member household is deleted.

## 3. Create an Account

### Starting state

- The user is authenticated with an active household membership.
- The user can create accounts in the selected scope.

### Main steps

1. The user opens Accounts and selects Add account.
2. The user enters a name, type, currency, optional institution, and non-sensitive identifier. Currency defaults to the household currency but may differ.
3. The user selects Personal or Household scope.
4. For Personal scope, the owner defaults to the current user.
5. The application creates the account and returns to the account list or detail view.

### Validation

- Name, account type, currency, and scope are valid.
- Personal scope has an active household member as owner.
- Household scope has no personal owner.
- Full credentials and sensitive bank details are rejected or never requested.

### Records created or updated

- Account

### Failure and recovery behavior

- Validation errors retain safe form values.
- A failed save creates no partial account.
- Accounts with history are archived rather than deleted.

### Permissions

- Authorized household members may create shared accounts.
- Users may create their own personal accounts.
- Creating an account for another member requires an explicit future permission policy.

## 4. Create or Manage a Category

### Starting state

- The user is authenticated in a household.
- Household categories have been seeded or category management is available.

### Main steps

1. The user opens category management from Transactions, Budgeting, or Settings.
2. The user enters a name, type, and optional parent category.
3. The application creates the category for the household.
4. The category becomes available to personal and household transactions and budgets.

### Validation

- Name and type are required.
- Category names follow the chosen household uniqueness policy.
- Parent category belongs to the same household.
- Parent selection cannot create a circular hierarchy.

### Records created or updated

- Category

### Failure and recovery behavior

- Validation failures preserve the form.
- Categories referenced by history are deactivated instead of deleted.
- A category merge workflow is deferred.

### Permissions

- Authorized household roles manage the shared category list.
- Viewers can use categories in permitted read views but cannot modify them.

## 5. Upload a CSV

### Starting state

- The user is authenticated.
- At least one accessible account exists.
- The user has a bank CSV file and permission to import into the selected account.

### Main steps

1. The user opens Import and selects an account.
2. The user selects a CSV file.
3. The backend validates and hashes the file.
4. Version 1 recognizes common date, description, amount, debit, and credit headers.
5. The backend parses rows into staged draft records and preserves a safe serialized representation of each source row.
6. The application shows the staged row summary.
7. Interactive mapping for unrecognized layouts is deferred to a later import-mapping feature.

### Validation

- The file has a `.csv` extension, is no larger than 10 MB, and contains no more than 10,000 transaction rows.
- File content is parseable as CSV using the selected encoding and delimiter.
- Required columns are recognized exactly once. Unknown layouts are rejected with the headers that were found rather than guessed.
- Dates and amounts can be parsed or are marked invalid for review.
- The selected account belongs to the current household and is accessible to the user.
- File hash and account are checked for likely repeat uploads.

### Records created or updated

- ImportFile
- ImportTransactionDraft for each source row
- Optional future ImportProfile or saved mapping

### Failure and recovery behavior

- Unsupported or unreadable files create no transaction records.
- A partially parsed upload remains resumable only if its status and drafts are internally consistent; otherwise it is marked Failed and can be retried.
- Duplicate-file warnings require confirmation rather than silently blocking legitimate reimports.
- No official Transaction is created during upload or parsing.
- The original uploaded file is not retained in version 1; its hash, metadata, and staged source-row values are retained.

### Permissions

- The user must have import permission for the account's scope.
- Personal-account imports are limited by the personal-data visibility policy.

## 6. Review Import Draft Rows

### Starting state

- An ImportFile has draft rows and is ready for review.
- No official transaction is required to exist for the pending rows.

### Main steps

1. The user opens the import review screen.
2. The screen shows parsed values, validation results, and duplicate warnings.
3. The user corrects parsed date, amount, description, or category when needed.
4. The user marks rows Approved, Rejected, or Skipped.
5. The user may filter to invalid, duplicate, uncategorized, or unreviewed rows.
6. The application saves review decisions without changing raw source values.

### Validation

- Approved rows have a valid date, nonzero valid amount, description, and accessible account.
- Selected categories belong to the household and are active.
- Corrections are stored separately from raw imported values.
- Duplicate warnings require an explicit user decision.

### Records created or updated

- ImportTransactionDraft parsed/corrected values
- Validation messages
- Review decisions
- Duplicate match references

### Failure and recovery behavior

- Review progress is saved incrementally.
- Reloading the page restores decisions and corrections.
- Failed saves leave the row visibly unsaved and allow retry.
- Rejecting a row is reversible until the import is finalized.

### Permissions

- The user must be allowed to review transactions for the import's account.
- AI suggestions, when later introduced, remain suggestions and cannot mark a row approved.

## 7. Approve an Import

### Starting state

- The ImportFile contains reviewed drafts.
- At least one valid draft is marked Approved.

### Main steps

1. The user reviews an import summary.
2. The user confirms approval.
3. The backend creates official transactions for approved drafts in a database transaction.
4. Each approved draft is linked to its resulting transaction.
5. The ImportFile counts and status are updated.
6. The result page shows imported, rejected, skipped, invalid, and duplicate counts.

### Validation

- Every approved draft still passes validation.
- No approved draft already has an approved transaction.
- Household, account, and permission checks are repeated at execution time.
- Duplicate detection is rechecked where race conditions are possible.

### Records created or updated

- Transaction records
- ImportTransactionDraft approved transaction links and final decisions
- ImportFile status and result counts

### Failure and recovery behavior

- Approval is idempotent.
- A retry cannot create duplicate transactions.
- Database failure rolls back the affected approval operation or records an explicit partial state that can be safely resumed.
- The result clearly identifies rows still needing attention.

### Permissions

- The user must have transaction-creation permission for the account.
- Confirmation is always explicit; automated or AI approval is prohibited.

## 8. Edit or Categorize a Transaction

### Starting state

- An official transaction exists and is visible to the current user.

### Main steps

1. The user opens the transaction from a list, dashboard, import result, or report.
2. The user changes permitted fields such as category, display description, date, note, or budget exclusion.
3. If correcting a balance discrepancy, the UI recommends an explicit adjustment transaction.
4. The user saves and affected budget/report calculations refresh.

### Validation

- Category belongs to the transaction's household.
- Edited values satisfy transaction rules.
- Original imported values remain preserved.
- Account or household reassignment is not an ordinary edit.
- Concurrency conflicts are detected rather than silently overwriting another edit.

### Records created or updated

- Transaction
- Modification metadata
- Future AuditEntry, when implemented
- Optional explicit adjustment Transaction

### Failure and recovery behavior

- Validation failures retain edits without changing the stored transaction.
- Concurrency conflicts show current stored values and allow deliberate retry.
- Reverting an edit restores editable values without deleting import history.

### Permissions

- Household transaction edits require an authorized shared-data role.
- Personal transactions follow the personal-data visibility and ownership policy.
- Viewers cannot edit.

## 9. Create a Monthly Budget

### Starting state

- The user is authenticated with an active household membership.
- Household categories exist.
- No BudgetMonth exists for the selected household, year, month, scope, and owner combination.

### Main steps

1. The user opens Budgeting and selects a month and scope.
2. The application creates a Draft BudgetMonth.
3. The user adds category lines and budgeted amounts.
4. The application displays actual and remaining amounts calculated from eligible transactions.
5. The user activates the budget when ready.

### Validation

- BudgetMonth uniqueness is enforced by household, year, month, scope, and owner.
- Personal scope has a valid owner; Household scope does not.
- Categories belong to the household and appear only once per budget month.
- Budgeted amounts use the household currency and valid precision.

### Records created or updated

- BudgetMonth
- BudgetLine records

### Failure and recovery behavior

- Drafts are saved and can be resumed.
- Duplicate creation routes the user to the existing budget.
- Closing or deleting a draft does not affect transactions.
- Active or historical budgets are closed/archived according to policy rather than destructively removed.

### Permissions

- Authorized roles manage household budgets.
- A user manages their own personal budget.
- Access to another member's personal budget requires an explicit future policy.

## 10. Copy the Previous Month's Budget

### Starting state

- A source BudgetMonth exists.
- No target BudgetMonth exists for the selected month and scope, or the user explicitly chooses how to merge with a Draft target.

### Main steps

1. The user selects Copy previous month.
2. The application previews source budget lines and active recurring suggestions.
3. The user includes, removes, or adjusts lines.
4. The backend creates the target Draft BudgetMonth and independent BudgetLines.
5. The user reviews and activates the new budget later.

### Validation

- Source and target scopes/owners are compatible.
- Target uniqueness is enforced.
- Categories remain active and belong to the household.
- Copied amounts are valid.

### Records created or updated

- Target BudgetMonth
- New independent BudgetLine records with Copied origin

### Failure and recovery behavior

- Failure creates no partial duplicate target.
- An existing target is never silently overwritten.
- Changes to the source month after copying do not change the target.

### Permissions

- The user must be able to read the source budget and create the target budget.

## 11. Create a Recurring Expense

### Starting state

- The user is authenticated.
- A suitable category exists.

### Main steps

1. The user opens Budgeting > Recurring Expenses.
2. The user enters a name, expected amount, frequency, scope, category, and date rule.
3. The user optionally selects an account.
4. The application saves the recurring expectation.
5. Future budget and forecast screens include relevant occurrences or suggestions.

### Validation

- Amount, frequency, category, scope, and start date are valid.
- Personal scope has a valid owner.
- Category and optional account belong to the household.
- Optional account scope is compatible with the recurring item's scope.
- End date is not before start date.

### Records created or updated

- RecurringExpense
- Optional future budget-line origin/reference when accepted into a budget

### Failure and recovery behavior

- Validation errors retain safe input.
- Deactivation stops future expectations but preserves historical use.
- Editing affects future projections only.
- No official transaction is created automatically.

### Permissions

- Authorized roles manage household recurring items.
- Users manage their own personal recurring items.

## 12. View the Dashboard and Forecast

### Starting state

- The user is authenticated and has selected Household or Personal scope.
- Some combination of accounts, transactions, budgets, or recurring items exists.

### Main steps

1. The user opens the Dashboard or Budgeting > Forecast.
2. The application calculates current-month actual spending and budget progress.
3. It adds future recurring expectations and explicit forecast assumptions.
4. It shows upcoming expenses, projected end-of-month spending, and explainable warnings.
5. When balance snapshots become available, it may show projected account balances over a selected horizon.
6. The user can navigate from totals to the underlying transactions, budget lines, or recurring items.

### Validation

- Every calculation applies the selected scope consistently.
- Excluded transactions and transfers follow documented budget rules.
- Matched actual transactions are not double-counted as future recurring occurrences.
- Missing data is shown as unavailable or estimated rather than reported as fact.

### Records created or updated

- None for ordinary viewing.
- Explicit temporary forecast assumptions may require a future supporting model.

### Failure and recovery behavior

- A failed section does not prevent other dashboard sections from rendering when possible.
- Empty states explain which setup step is missing.
- Calculations can be recomputed; forecast output is not authoritative stored data.

### Permissions

- Results include only accounts, transactions, budgets, and recurring items visible to the current user.
- Personal information never leaks into another member's household or personal view.

## Workflow Dependencies

The recommended implementation order is:

1. Authentication and household setup
2. Household membership and permissions
3. Accounts and household categories
4. Transactions
5. CSV upload, mapping, draft review, and approval
6. Monthly budgets and copy-forward behavior
7. Recurring expenses
8. Dashboard, forecast, and reporting

Merchant aliases, categorization rules, saved import profiles, reconciliation, balance snapshots, and AI-assisted suggestions should follow the first complete transaction-import and budgeting workflow.
