# Manual QA and Regression Test Plan

Use this living checklist to verify BudgetApp before a release. Update it whenever
a feature adds a user workflow or a defect reveals a regression case that should
never be missed again.

This plan is for normal feature testing and regression testing in Development or
Scratch. It is deliberately more thorough than the short Production smoke test in
the [local Production deployment checklist](local-production-deployment-checklist.md).

## When to use this plan

- **During feature development:** run the checks for the changed workflow and any
  directly affected workflows.
- **Before merging:** run the changed-workflow checks and the Critical Regression
  section.
- **Before a release:** run the complete checklist against `BudgetAppDb_DEV` or a
  disposable `BudgetAppDb_Scratch` database.
- **After Production deployment:** run only the safe smoke tests in the deployment
  checklist. Do not perform the full destructive regression suite in Production.

## Test run record

Copy this block into the pull request, release notes, or a dated QA record.

```text
Test date:
Tester:
Branch / commit:
Build or release:
Environment: Development / Scratch
Database:
Browser and version:
Screen sizes tested:
Result: Pass / Pass with known issues / Fail
Failed or skipped checks:
Related issue links:
Notes:
```

## Test data and roles

Prepare reusable non-Production test data:

- [ ] An owner account with an established household.
- [ ] A second account that can accept an invitation and act as a household member.
- [ ] A viewer account for read-only permission checks.
- [ ] Two households available to a multi-household user.
- [ ] At least one shared account and one personal account.
- [ ] Active and deactivated categories, including root categories and subcategories.
- [ ] A small valid CSV containing income, spending, duplicate candidates, and
      uncategorized descriptions.
- [ ] A malformed CSV for validation testing.
- [ ] Draft, Active, and Closed monthly budgets where practical.
- [ ] Annual targets covering overall-category and subcategory budgeting modes.

Do not use real financial information, passwords, tokens, or Production exports as
ordinary QA fixtures.

## Entry checks

- [ ] The intended branch and commit are checked out.
- [ ] There are no unexplained local changes.
- [ ] Development starts against `BudgetAppDb_DEV`, or the test explicitly uses
      `BudgetAppDb_Scratch`.
- [ ] Startup logs identify the expected environment and database.
- [ ] Required database migrations have been applied to the test database.
- [ ] The client production build succeeds.
- [ ] Client lint succeeds.
- [ ] Automated tests pass, or every existing failure is recorded and understood.
- [ ] Browser developer tools show no unexpected errors on initial load.

## Critical regression checklist

Run this shorter section before every merge, even when the change appears isolated.

- [ ] Application starts and the health endpoint succeeds.
- [ ] A registered user can sign in and sign out.
- [ ] Refreshing an authenticated page preserves the expected session and route.
- [ ] Dashboard loads for the selected household.
- [ ] Sidebar navigation reaches every primary and Settings page and can scroll.
- [ ] The current household is clearly identified and household switching works.
- [ ] A user cannot see another household's data.
- [ ] A user cannot see another member's personal accounts or personal budget data.
- [ ] Account, category, transaction, monthly budget, and annual target pages load.
- [ ] A small CSV can be staged, reviewed, and completed without duplicate official
      transactions.
- [ ] Transaction filters return plausible results and CSV export matches the
      visible filters.
- [ ] A Draft monthly budget can be edited, saved, refreshed, and reopened with the
      same values.
- [ ] No unexpected error or fatal entry appears in the server log.

## Authentication and recovery

- [ ] Registration succeeds with valid details.
- [ ] Duplicate email registration is rejected safely.
- [ ] Login succeeds with valid credentials.
- [ ] Login fails with an incorrect password without revealing sensitive details.
- [ ] Logout ends the authenticated session.
- [ ] Protected pages redirect an unauthenticated visitor to login.
- [ ] Password recovery always shows the same confirmation for existing and unknown
      email addresses.
- [ ] An existing account produces a password-recovery message in the configured
      File outbox or SMTP recipient inbox.
- [ ] The recovery link uses the configured public base URL.
- [ ] A valid recovery link resets the password and allows login with the new one.
- [ ] An invalid or expired recovery token is rejected without changing the password.
- [ ] No password, reset token, or secret is written to normal client-visible data or
      routine logs.

## Email delivery

- [ ] The Gmail setup script works from a different working directory, hides the
      app password, and preserves the existing database connection secret.
- [ ] File, Disabled, and SMTP modes take effect after restart.
- [ ] With SMTP enabled, password recovery arrives at the existing test account's
      real inbox; the link opens the configured frontend and resets the password.
- [ ] An invitation arrives at the intended test inbox; acceptance, resend, and
      revocation behave correctly with delivered links.
- [ ] An invalid app password produces a controlled backend Authentication failure;
      recovery keeps a generic response and invitations remain pending for Resend.
- [ ] Disabled mode does not claim an invitation was delivered.
- [ ] Provider acceptance is distinguished from inbox arrival: inspect spam/bounces
      when a message is accepted but absent from the inbox.
- [ ] A localhost link is tested on the host computer; any LAN/private link is tested
      on the intended recipient device with trusted HTTPS.
- [ ] Development user secrets are used by Visual Studio; the local deployed app
      uses its own protected credential and backend environment settings.
- [ ] No SMTP password, recipient address, message body, or token-bearing link is
      present in routine logs, API configuration, or frontend assets.
- [ ] Returning to File mode stops real sends and produces the expected local files.

## Security baseline

- [ ] Production is reachable only over HTTPS with the intended trusted certificate.
- [ ] Production responses include HSTS; Development does not pin its local hostname.
- [ ] Responses include CSP, frame-denial, MIME-sniffing, referrer, and permissions
      headers without breaking normal page behavior.
- [ ] API responses containing account or financial data specify `Cache-Control:
      no-store`.
- [ ] The authentication cookie is host-only, Secure, HttpOnly, SameSite=Strict, and
      does not contain a Domain attribute.
- [ ] An authenticated POST, PUT, or DELETE without a valid antiforgery header fails.
- [ ] Anonymous requests cannot read any household, personal, import, budget,
      transaction, activity, dashboard, or tutorial endpoint.
- [ ] A member cannot substitute another household, user, account, import, budget,
      transaction, or invitation ID to cross an authorization boundary.
- [ ] Repeated failed sign-ins trigger lockout/rate limiting without revealing whether
      the email exists.
- [ ] Oversized import and import-profile inspection files are rejected before parsing.
- [ ] Application and error logs contain no passwords, bearer tokens, connection
      strings, complete CSV rows, or unnecessary financial details.
- [ ] Dependency and secret scanning are enabled and have no unresolved High/Critical
      finding accepted without a documented decision.

## First-time user and household onboarding

- [ ] A new uninvited user is guided to create a household.
- [ ] A new invited user who registers or signs in without using the email link sees
      the matching pending invitation before the create-household form.
- [ ] An invitation can be accepted after the invited user registers.
- [ ] Invitation acceptance selects the joined household.
- [ ] An account with a different email cannot see or accept the invitation by ID.
- [ ] Refreshing or signing in again does not restart completed onboarding.
- [ ] A user with no household receives a clear next action.
- [ ] Tutorials can be exited and restarted without changing financial data.

## Household membership and switching

- [ ] An owner can edit allowed household details.
- [ ] An owner can invite a new email address with the intended role.
- [ ] Pending, accepted, expired, and revoked invitations display correctly.
- [ ] Resending and revoking an invitation behave correctly.
- [ ] Invitation email links use the configured public base URL.
- [ ] Accepting an invitation requires the matching signed-in email address.
- [ ] A member can leave a household when household rules permit it.
- [ ] The last owner cannot leave without satisfying the ownership rules.
- [ ] A multi-household user can switch households from the persistent header.
- [ ] Switching households refreshes all household-scoped pages and counts.
- [ ] A Viewer can view allowed information but cannot perform owner/member writes.
- [ ] Direct API or copied-URL access cannot cross household boundaries.

## Navigation, layout, and tutorials

- [ ] Sidebar items are reachable at normal desktop height.
- [ ] Sidebar scrolls when its contents exceed the viewport.
- [ ] Collapsing and expanding the sidebar works and persists as intended.
- [ ] Mobile navigation opens, closes, and reaches every page.
- [ ] Header household context remains understandable on narrow screens.
- [ ] Browser Back and Forward preserve the expected page.
- [ ] Refreshing a nested page does not produce a blank page or 404.
- [ ] Unsaved-edit warnings appear where expected and allow both Stay and Leave.
- [ ] Keyboard focus remains visible on links, buttons, inputs, and dialogs.
- [ ] The learn-only tutorial highlights the correct controls and can be completed.
- [ ] Coming-soon tutorials are clearly unavailable rather than appearing broken.

## Interface acceptance checklist

Use this short checklist for every new page or substantial workflow change. Run it
as both a new and a returning user where applicable. Record Pass, Fail, or Not
applicable; a source review alone is not a passed visual/keyboard test. See the
[2026-10-05 interface audit](interface-usability-audit-2026-10-05.md) for the
initial findings and pending live tasks.

- [ ] The page title, current navigation item, household, and financial scope make
      the user's current location and data context clear.
- [ ] The main action and next step are understandable without reading a tutorial;
      secondary/destructive actions are distinguishable and explain consequences.
- [ ] Loading, successful empty results, stale data, and failed requests have
      distinct messages. Failures stop loading and offer a safe recovery path.
- [ ] Save progress and success are clear. Failed saves preserve entered values,
      and retries do not create duplicate writes.
- [ ] With dirty edits, test sidebar links, section links, Return to dashboard,
      Back/Forward, sign-out, refresh/close, and household/year/scope changes.
      Stay preserves values and context; Leave proceeds only after confirmation.
- [ ] Report links preserve the intended period, scope, category, currency, and
      budget-inclusion filters; results reconcile across all transaction pages.
- [ ] Keyboard users can reach all intended controls, skip repeated navigation,
      identify current location, and follow route changes with predictable focus.
- [ ] Inputs and icons have meaningful accessible names; financial values retain
      category/column meaning without relying only on color or indentation.
- [ ] Dialogs, calculator popovers, and tutorials have usable keyboard dismissal
      and focus return. A guided tour allows its intended target, not unrelated
      background actions, and explains recovery when a target is unavailable.
- [ ] Check desktop, narrow screens, 200% zoom, and navigation breakpoint widths
      including 760px, 800px, and 880px; menus, tables, and tutorial targets remain usable.
- [ ] Viewer, personal-scope, and multi-household cases explain permitted actions
      without exposing another user's or household's data.
- [ ] Help uses consistent terms: annual target, monthly equivalent, Draft,
      protected month, staged import, and official transaction. Coming-soon actions
      cannot be mistaken for working features.

## Accounts and recurring expenses

- [ ] A shared account can be created, edited, archived, and reactivated.
- [ ] A personal account is visible only to its owner.
- [ ] Account currency and scope display correctly.
- [ ] Invalid account details produce useful validation messages.
- [ ] A recurring expense can be created, edited, deactivated, and reactivated.
- [ ] Recurring expenses use valid active categories and the intended scope.
- [ ] Building a monthly budget from recurring expenses produces the expected totals.
- [ ] Repeating the operation does not silently overwrite a protected budget.

## Categories and categorization rules

- [ ] Root categories and subcategories can be created and reordered.
- [ ] Duplicate category names at the same level are rejected.
- [ ] Categories can be deactivated and reactivated.
- [ ] Renaming a category updates its displayed name on assigned historical
      transactions and budgets without altering transaction descriptions.
- [ ] Existing category assignments remain attached after a rename.
- [ ] A categorization rule can be created for each supported match operator.
- [ ] Rule priority can be reordered and persists after refresh.
- [ ] Rules can be edited, deactivated, reactivated, and deleted.
- [ ] Rules never overwrite a manually supplied category unless the user explicitly
      chooses the reapply action.
- [ ] Creating a rule during import review offers to fill other matching
      uncategorized rows.
- [ ] Choosing Not now leaves the remaining rows unchanged.

## CSV import and review

- [ ] The CSV template downloads successfully.
- [ ] A valid CSV upload creates staged rows, not official transactions.
- [ ] File size, row limit, required column, date, and amount errors are explained.
- [ ] Import profiles map columns and amount conventions correctly.
- [ ] Uploading the same file is detected and requires explicit confirmation.
- [ ] Duplicate checking identifies plausible existing matches.
- [ ] A staged row can be corrected and saved.
- [ ] Leaving with unsaved staged corrections warns the user where applicable.
- [ ] Fill uncategorized applies active rules only to eligible rows.
- [ ] Reapply to all requires confirmation and reports changed/unchanged counts.
- [ ] Approve, exclude, undo/reset, and remove-row actions update the correct rows.
- [ ] Possible duplicates require the intended acknowledgement before approval.
- [ ] Completing an import creates exactly the approved transactions.
- [ ] Completing or retrying does not create duplicate official transactions.
- [ ] Discarding an in-progress import requires confirmation and removes only staging
      data.
- [ ] Completed imports remain understandable as historical records.

## Transactions and export

- [ ] Transactions load for all visible accounts.
- [ ] Date, account, description, category type, category, subcategory, and
      uncategorized filters work individually and together.
- [ ] Pagination retains the applied filters.
- [ ] Editing a transaction saves the intended date, amount, description, merchant,
      notes, category, and budget treatment.
- [ ] Cancelling an edit restores the saved values.
- [ ] Navigating away from an unsaved edit asks for confirmation.
- [ ] Choosing Stay preserves the edit; choosing Leave discards it.
- [ ] Excluded and voided/reversal behavior is represented correctly.
- [ ] Personal transactions remain visible only to the personal-account owner.
- [ ] CSV export contains only transactions matching the active search and filters.
- [ ] Export columns are human-readable and spreadsheet-safe.
- [ ] Export does not expose internal IDs or unrelated household/personal data.

## Monthly budgets

- [ ] Household and Personal scopes show only authorized data.
- [ ] A blank Draft budget can be created.
- [ ] A previous month can be copied into a new Draft.
- [ ] Annual targets can populate selected Draft months.
- [ ] Existing Draft replacement requires explicit confirmation.
- [ ] Active and Closed budgets are not silently overwritten by annual allocation.
- [ ] Overall-category and detailed-subcategory modes cannot conflict.
- [ ] Budget amounts save and remain correct after refresh.
- [ ] The calculator keypad performs `+`, `-`, `*`, `/`, decimal, and parenthesized
      calculations and applies the selected result only when requested.
- [ ] Invalid and negative calculations do not alter a budget field.
- [ ] Actual, remaining, uncategorized, and currency-mismatch values are plausible.
- [ ] Draft activation, return to Draft, closure, and reopening obey their rules.
- [ ] Deleting a Draft requires confirmation and does not delete transactions.

## Annual targets and annual overview

- [ ] A fiscal year and start month can be selected, including a non-January year.
- [ ] Household fiscal-year default affects new plans without rewriting saved plans.
- [ ] Overall-category and subcategory annual targets save without conflicts.
- [ ] Additional target lines can be saved after the initial save.
- [ ] Monthly and quarterly equivalents calculate correctly.
- [ ] The annual-target calculator applies results correctly.
- [ ] Creating selected monthly Drafts reports created, replaced, skipped, and
      protected months clearly.
- [ ] Changing a monthly budget does not change the stored annual target.
- [ ] Changing an annual target does not silently resynchronize existing months.
- [ ] Annual overview totals reconcile with the underlying monthly budgets.
- [ ] Actual totals reconcile with filtered transactions for the same period/scope.
- [ ] Months with no budget are distinguishable from months budgeted at zero.
- [ ] Draft, Active, and Closed month statuses display correctly.
- [ ] Links open the relevant monthly budget or filtered transaction view.
- [ ] Empty-category, empty-budget, and empty-transaction years render safely.

## Dashboard and activity history

- [ ] Dashboard panels load, rearrange, and retain their saved layout.
- [ ] Dashboard values change appropriately after a transaction or budget update.
- [ ] Activity history shows successful important household actions.
- [ ] Personal activity is visible only to the person who owns it.
- [ ] Household activity is visible to authorized household members.
- [ ] Date, user, action, and entity filters work.
- [ ] Failed operations do not create misleading success events.
- [ ] Audit records cannot be edited or deleted through normal application actions.
- [ ] No passwords, tokens, full uploaded files, or unnecessary sensitive values
      appear in activity details.

## Persistence, errors, and recovery

- [ ] Saved changes survive browser refresh.
- [ ] Saved changes survive application restart.
- [ ] Switching households and returning does not leak or lose state.
- [ ] A temporary API failure produces a useful error and leaves saved data intact.
- [ ] Retrying a failed action does not create duplicate records.
- [ ] Concurrency conflicts ask the user to reload rather than silently overwriting
      another user's change.
- [ ] Empty states provide a relevant next action.
- [ ] Server logs contain enough context to diagnose failures without exposing
      secrets.

## Browser and responsive regression

At minimum, test the supported desktop browser and one narrow/mobile layout.

- [ ] Desktop layout at approximately 1920×1080.
- [ ] Smaller desktop/laptop layout at approximately 1366×768.
- [ ] Narrow/mobile layout at approximately 390×844.
- [ ] No important controls are clipped or inaccessible at 200% browser zoom.
- [ ] Long category, account, household, and file names wrap or truncate safely.
- [ ] Tables and wide budget/overview sections remain usable without breaking the
      page layout.
- [ ] Confirmation dialogs, calculator popovers, and tutorial overlays remain
      visible within the viewport.

## Exit and sign-off

- [ ] Every required check is marked Pass, Fail, or Not applicable.
- [ ] Every failure has a GitHub issue with reproduction steps and severity.
- [ ] Skipped checks and their reason are recorded.
- [ ] No unexplained browser console, server error, or fatal log entries remain.
- [ ] Database contents remain internally consistent after the test run.
- [ ] Temporary test uploads and sensitive test artifacts have been removed.
- [ ] The tester recorded the branch/commit and final result.
- [ ] The release is approved, rejected, or explicitly accepted with known issues.

## Adding future regression checks

When a feature is added or a defect is fixed:

1. Add at least one successful-path check to the relevant section.
2. Add the permission/privacy check when household or personal data is involved.
3. Add a failure or boundary check when validation is involved.
4. Add a persistence check when data is written.
5. Add the exact former failure as a permanent regression check for a defect.
6. Add or update automated tests where the behavior can be verified reliably in
   code.

Use this template for a new manual case:

```text
- [ ] [Workflow] Starting from [precondition], when [action] is performed,
      [expected result] occurs and remains correct after [refresh/restart if relevant].
```
