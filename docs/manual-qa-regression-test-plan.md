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

## Saved transaction filters (#155)

- [ ] Apply a search using account, date mode, category/subcategory, description,
  currency, budget inclusion and spending-only. Save a named preset. Reload and
  apply it; all choices, all-page totals and exported results match the search.
- [ ] Repeat with uncategorized, all dates, a fixed date, a fixed month (including
  leap February), a fixed range, and a rolling past-X-days period. Reapply rolling
  filters later: dates move with the local calendar, fixed choices do not.
- [ ] Apply from page two: results start on page one. Change filter controls but
  do not apply: export still uses applied filters and saving a preset is blocked.
- [ ] Rename and delete presets. Duplicate names ignoring case are rejected.
  Deleting a preset leaves the current results and all transactions unchanged.
- [ ] Another member (including Owner/Admin) cannot see your presets; a Viewer
  can manage their own. Switch households: presets never carry into another
  household. Verify isolation again after signing out and changing users.
- [ ] Deactivate a referenced account/category: historical filtering still works.
  For removed/inaccessible references, apply stages the original selections with
  explained warnings, keeps current results, and blocks applying unchanged
  invalid selections. Explicitly choose valid/all selections and apply again.
- [ ] Cancel preset application while a transaction/inclusion edit is unsaved:
  edits, filters and results remain intact. Name/rename edits also warn on route
  changes, refresh and household switching; canceled navigation keeps them.
- [ ] Simulate failed initial list load and refresh: no false empty state or
  enabled stale actions; retry is available. Failed creation/rename keeps names;
  retry after a lost creation response does not create duplicates. Concurrent
  rename/delete returns a conflict with reload guidance.
- [ ] Open annual overview drill-down, then apply a different preset: report
  mismatch is explained. Restore report filters and return to the original year
  and scope through `/budgeting/annual-overview`. No origin metadata is saved.
- [ ] Keyboard-test selector, apply, details, naming, rename and delete controls.
  Check visible focus, screen-reader labels/status messages, narrow widths and
  200% zoom. Long preset names must not cause horizontal page overflow.

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
- [ ] Unverified users reach the dedicated confirmation page instead of app-data
      pages. Direct data APIs are blocked; existing data is preserved and verified
      recipients regain access and can accept matching invitations (#149).
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

- [ ] Registration with valid details requests confirmation, signs in with the
      just-entered credentials, and reaches the verification gate without typing
      the password again. Passwords are not saved in browser storage.
- [ ] Duplicate registration has the same public status/message and sends no extra
      registration message. Incorrect credentials retain generic guidance; correct
      credentials use the normal sign-in behavior. A temporary sign-in failure
      offers manual sign-in/recovery without creating or mailing twice.
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

## Application administration / account support (#130)

Setup: `docs/application-administration.md`. Use disposable Development accounts and
the audit/grant migrations. Never test recovery against real users or production.

- [ ] No database grants: no account automatically becomes an app admin. Legacy
      configured administrator IDs are ignored and cannot bypass the database grants.
      Ordinary users and household Owner/Admin users cannot access any `/api/admin`
      GET/POST even by direct URL or a modified browser navigation flag.
- [ ] Run the email-based initial-owner tool: inspect Development server/catalog,
      explicitly confirm, and verify private audit/notification. Cancellation, missing
      account, unconfirmed email, disabled MFA or a second setup cannot grant access.
      There is no browser-accessible bootstrap endpoint. No UUID lookup is required.
- [ ] Password-only/no-MFA sign-in cannot
      access operator APIs. Enable/complete MFA, then enter via sidebar or Account
      settings; the page is also reachable without household membership.
- [ ] Search/status returns only basic account/security metadata. App-admin access
      does not grant access to another household's financial APIs or activity.
- [ ] Open Application administration → Users: existing users appear without typing
      a search. Check 20-row pagination, optional name/email filtering, filter retention
      across pages, Show all users, and verified/unverified/MFA/role/lockout labels.
      Ordinary users and password-only sessions cannot view the directory by direct URL.
- [ ] User-row Account support/Manage administrator access shortcuts select the right
      account with fresh server data and no automatic action or MFA request. Only owners
      see access-management shortcuts. Failed linked loads stop loading and offer retry.
      Canceled navigation away from existing support/access drafts preserves them.
- [ ] Directory initial/refresh failures are not reported as zero users; stale lists
      explain the refresh failure and disable shortcuts. A 401/403 hides retained rows.
      Verify keyboard, screen-reader labels, narrow widths and 200% zoom.
- [ ] Search, selected-account and audit loading/failure/empty/stale states are
      distinct. Failed refresh disables actions; revoked access hides retained data.
      Keyboard, labels, route title/skip link, narrow layouts and 200% zoom work.
- [ ] A support action requires a reason, the operator's current password, and fresh
      MFA. Prepared target/action/reason cannot be changed without starting again.
      Wrong user/action/version/code, expired codes and canceled confirmation do not
      execute the action. Resend/starting over does not reset attempt limits.
- [ ] Password-reset mail goes only to the account's verified email; no password is
      exposed/assigned by the operator. Resetting it leaves MFA on and invalidates
      old sessions as the existing recovery flow specifies.
- [ ] Sending/opening MFA recovery does not reset anything. Only the delivered,
      unexpired latest link plus the recipient's current password completes it.
      Old recovery codes/pending logins/sessions then fail; ten new codes appear once.
      MFA stays on; recovery does not auto-login or modify financial data.
- [ ] Replaced/used/expired/undelivered links, changed email/password, revoked actor
      grant/session, and actor MFA disabled are rejected. Wrong recipient passwords
      are limited by Identity lockout. There is no lost-email/no-codes recovery bypass.
- [ ] Session revocation invalidates existing sessions immediately, preserves all
      financial/account/MFA data, and attempts a private notification. Notification
      failure does not claim the revocation failed or automatically repeat it.
- [ ] Self/other application-administrator accounts cannot be changed by support tools.
      There are no impersonation, arbitrary email, deletion or
      unconditional MFA-disable controls.
- [ ] Only installation owners can list/manage administrators. Support admins and
      household owners cannot grant/revoke roles, including by direct API calls.
      New grants require verified email and MFA; account/grant version conflicts,
      altered action details, wrong/expired proof and canceled confirmation do not write.
- [ ] Grant, promote/demote and remove administrators without restarting. Affected
      sessions/proofs become invalid; new login reflects current privileges. Reasons,
      actor/target, result and notification failure stay in the private audit only.
      A failed notification does not undo or repeat a committed grant.
- [ ] Keep the last eligible installation owner: reject removal, demotion and MFA
      disabling. With another eligible owner, own-role removal signs out predictably.
      Concurrent SQL Server owner-removal/MFA-disable requests cannot leave zero
      eligible owners. Directly clearing grants does not reopen bootstrap.
- [ ] All executions and completed recovery are in the private administrative audit,
      not household activity. Reasons contain no credentials/financial details. Codes,
      links and passwords are absent from audit/API metadata/browser storage/safe logs.
- [ ] Simulate a lost response: Check recorded result performs only a read. Repeat
      the same operation UUID: no duplicate email/write. Check real SQL Server
      concurrent submissions: a recovery link/code is consumed at most once.
- [ ] Failed SMTP provides an honest recorded delivery result, keeps security intact,
      and permits only explicit later retry. Pending/unknown delivery is not reported
      as success. Failed/canceled forms clear passwords but preserve safe draft context.
- [ ] Unfinished forms/once-only recovery codes protect route and household switching;
      canceled navigation preserves edits. Recovery-link tokens leave the address bar.

## Optional email multi-factor authentication (MFA) (#135)

Use disposable Development accounts, never production credentials/recovery codes.
Record SMTP mode, browser/assistive technology, viewport, and results. Setup details:
`docs/email-login-verification.md`.

- [ ] An existing unenrolled account signs in normally. The dashboard shows a
      non-blocking setup reminder linked to personal Account settings; no enrollment
      or email is triggered by visiting either page. Confirmed/unconfirmed/no-household
      account settings remain correctly available.
- [ ] Enrollment requires current password and an emailed six-digit code. Requesting
      a code alone does not enable verification. Delivery failure leaves it off and
      gives an explicit retry. An incorrect/expired/replaced code cannot enable it.
- [ ] Settings, dashboard, sign-in, and security emails consistently call the feature
      Multi-factor authentication (MFA). There is one **Resend code** action (with a
      cooldown), not a second ambiguous "start new verification" action.
- [ ] The email input shows six boxes. Type and paste all six digits (including
      leading zeros and codes copied with spaces/hyphens); try Backspace, arrows,
      select-all/replace, clicking a filled digit, and one-time-code autofill. It
      remains one labeled keyboard/screen-reader input, fits narrow/200% layouts,
      and rejects longer/nonnumeric codes instead of silently truncating them.
      Switching to recovery-code entry focuses its normal, full-length input.
- [ ] In settings, an expired/unavailable challenge offers explicit **Resend code**
      recovery with the current password; no save or automatic resend occurs. On
      expired login, return to password sign-in; no expired pending session bypass.
- [ ] Successful enrollment displays ten codes once, protects navigation/household
      switching until acknowledged, and leaves financial records/shared activity
      unchanged. Save codes offline; none appear in browser storage or safe logs.
- [ ] Sign out/in: password-only success does not authorize account or financial APIs.
      The second screen is keyboard reachable and announces its purpose. Correct code
      completes without another password and preserves a safe intended destination.
- [ ] Refresh the pending screen or reopen it in the same browser: resume the challenge
      without sending another email. Cancel returns to password sign-in; canceled,
      consumed, wrong-user, wrong-purpose, or expired challenges cannot complete.
- [ ] Codes expire after five minutes; sessions after ten. Resend has a one-minute
      cooldown and invalidates the old code without extending the session or resetting
      failed attempts. Five failed code attempts lock login for fifteen minutes,
      including attempts split across new password steps. Check real SQL Server
      simultaneous submissions: one code/recovery code must succeed at most once.
- [ ] Simulate email failure only in an isolated installation. No password-only
      bypass occurs; explicit resend/recovery remains available. A recovery code works
      once, reduces the remaining count, and leaves verification on.
- [ ] Code replacement requires password plus fresh action-specific verification,
      invalidates all older codes, and displays only the new set once. Lost success
      responses give a safe read/re-enrollment path, not automatic duplicate writes.
- [ ] Turning off the last method requires fresh proof and explicit warning.
      Cancel does not write. Successful disabling preserves data, removes recovery
      codes, restores password-only sign-in and dashboard reminder, and attempts a
      private security-notification email.
- [ ] Password/email changes require fresh proof while enabled. Pending replacement
      does not receive login codes until confirmed; confirmation keeps verification
      enabled, uses the new mailbox, and invalidates older sessions/challenges.
      Password reset changes only the password, does not sign in or turn verification off.
- [ ] Other pre-enrollment sessions are revoked. Completed verified sessions survive
      normal reads/profile refresh without repeatedly asking for sign-in. Keep me
      signed in applies only to the completed session, not trusted-device bypass.
- [ ] Failed security saves preserve non-secret form context, clear passwords/codes,
      stop saving indicators, and offer an explicit retry without claiming success.
- [ ] At 390px, 200% zoom, and with keyboard/screen reader: labels, error/retry states,
      code type toggle, countdown/expiry guidance, recovery list, confirmation, and
      acknowledgement are reachable and understandable without horizontal clipping.
- [ ] Losing email and all saved codes clearly explains the lack of self-service
      recovery. No household-admin reset or emergency password-only bypass is offered.

## Email ownership and email changes (#149)

Use Development/Scratch accounts and inboxes you control. Email changes can now
be tested through **Settings → Account settings** (#156).

- [ ] Register a new address. Confirmation arrives in the configured File outbox
      or SMTP inbox and uses the correct reachable HTTPS frontend.
- [ ] Sign in unverified. Dashboard, household setup/settings, budgets, transactions,
      imports, reports, tutorials, and invitation URLs lead to the dedicated
      **Confirm your email** page; no sidebar or private data is displayed.
- [ ] Direct read/create/edit/import/delete API requests receive confirmation-required
      `403`, with no data writes/deletions. Account status, resend/confirmation,
      recovery, and sign-out remain available without a redirect loop.
- [ ] An existing unverified account's memberships, budgets/amounts, transactions,
      and saved household selection remain intact while blocked. Verify, continue
      to the intended page, and confirm those same records are accessible again.
- [ ] Request confirmation for an older account that had never verified its address.
      No migration, bulk mailing, or automatic verified flag is needed.
- [ ] Open a confirmation link while signed out or in the wrong account. Guidance
      explains how to sign in correctly and no verification occurs on page load.
- [ ] Explicit confirmation verifies the address; refreshing preserves it. Reuse,
      tampering, missing tokens, and expiry after one hour fail safely.
- [ ] Confirm in a second tab using the same browser/profile and exact app host.
      Neither tab requires another login. Returning to the waiting tab automatically
      exposes **Continue**; manual **Check confirmation status** remains available.
      Continue preserves the intended page, filters, and invitation URL. A different
      browser/profile/device requires one matching-account sign-in, not another
      after successful confirmation. Ordinary proof does not revoke existing sessions.
- [ ] Background status refresh failures keep the page/session and allow retry;
      a delayed response cannot overwrite successful confirmation or sign-out.
      Reopening an old link for the already confirmed matching address provides
      Continue instead of attempting to consume it again.
- [ ] Rapid resend requests do not produce additional messages. After one minute,
      one explicit retry generates a new link; the older unexpired link no longer works.
- [ ] Resend cooldown survives application restart. Concurrent requests through
      separate SQL Server-backed sessions do not bypass the delivery cooldown.
- [ ] Request-rate rejection shows retry guidance and a usable retry action, not
      an endless spinner. It does not silently send or queue extra mail.
- [ ] For an account registered under someone else's address, every pending-list,
      preview, token-accept, and ID-accept call is rejected without revealing invitation
      metadata. A confirmed matching recipient can then accept exactly once.
- [ ] Recover an impersonated test registration using its inbox, reset the password,
      and confirm a fresh link. Old sessions/links cannot regain invitation access.
- [ ] Request a new email with the current password. Before confirmation, the old
      address, verification state, login, memberships, and financial data are unchanged.
- [ ] Confirm the new-address link as the requesting account. New-address login and
      invitations work; old-address login/invitation matching stops; other sessions
      must sign in again. No membership/budget/transaction record is duplicated.
- [ ] Wrong passwords, expired/used/wrong-account links, duplicate addresses, and
      an address claimed after request leave the original email and username intact.
- [ ] SQL Server concurrent target-address claims cannot produce duplicate emails
      or a partially changed username/email pair; record any conflict/retry behavior.
- [ ] Simulate Disabled or failed delivery. The account and data are preserved, but
      unverified app access remains blocked. Resend, recovery, and sign-out remain
      usable; the address is not changed and retry/support guidance is clear.
      Restore delivery and complete a fresh request after the cooldown.
- [ ] Routine logs contain no passwords, raw proofs, target addresses, or token-bearing
      links. Development outbox files remain sensitive test artifacts.
- [ ] Confirmation/resend pages and notices work with keyboard, screen reader,
      narrow layout, long email addresses, and 200% zoom; meaningful status/errors
      are announced and controls remain reachable.

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

## Account settings regression (#156)

Use disposable Development/Scratch accounts and inboxes you control. Never record
password values, confirmation proofs, or pending private addresses in shared QA evidence.

- [ ] **Settings → Account settings** is identifiable/current in the sidebar. It
      is also linked from onboarding and verification, and remains accessible with
      no household or a failed household load. Direct anonymous access preserves
      the destination through login. No household role grants access to another account.
- [ ] The three sections have visible labels and independent save buttons. Current
      email, verification status, and pending replacement are unmistakably different.
      Without verification, only account maintenance is available; financial APIs
      stay blocked and existing data remains unchanged.
- [ ] Save a display name and verify it persists after refresh and appears as the
      own profile/member name. Empty/whitespace/overlong names fail safely. A stale
      second-tab save cannot overwrite the first tab; reload asks before discarding.
- [ ] Saving one section retains edits in the other sections. Canceled sidebar,
      Back/Forward, return, refresh/close, sign-out, and household switching keep
      edits. A household switch never retargets an account edit or creates shared
      account-security activity. Delayed household loading does not reset the form.
- [ ] Current-password checks reject invalid email/password changes. Failed saves
      retain safe name/email edits but clear password inputs; retries require re-entry.
      Passwords are not placed in browser storage, shared activity, or routine logs.
- [ ] Request a replacement email. The current email/login and verification remain
      unchanged; the pending address/expiry become visible only in this account.
      Duplicate-address/delivery-failure guidance does not reveal another account.
      After one-hour expiry, request a new link explicitly; wait a minute between requests.
- [ ] Confirm the replacement as the matching account and return to settings. The
      new login/email is verified, pending status clears, and membership/financial
      ownership stays attached to the same account. Other sessions must sign in again.
- [ ] Clear email form discards only unsaved entries—not an already submitted request.
      Resending current-address confirmation never confirms a pending replacement.
- [ ] Change password successfully: the finishing browser stays signed in, other
      sessions are revoked, old credentials fail, and new credentials work. Older
      pending confirmation links require fresh requests.
- [ ] Initial/refresh failures stop loading and offer a read-only retry. Stale data
      is clearly marked and unavailable for saves. A failed read after a successful
      email/password write never repeats that write. Rapid clicks issue one pending write.
- [ ] Own-account APIs ignore arbitrary target-user IDs; anonymous callers cannot
      read settings, and profile mutations without antiforgery fail. Security changes,
      pending addresses, and confirmation details are absent from shared household activity.
- [ ] Keyboard, Skip to main content, titles/announcements, focus outlines, narrow
      layouts, long email addresses, 200% browser zoom, and a screen reader work
      across all sections. Focus/entered values are not reset by routine status reads.

## Contextual help regression (#154)

Use Development/Scratch sample records. Help itself is read-only; do not confirm
destructive actions against records that must be kept.

- [ ] Open **About scope and privacy** on Accounts, Transactions/budget inclusion,
      Monthly Budget, Annual Targets/Overview, and import controls. Explain account
      access versus budget inclusion, full-amount Personal + Household counting,
      overlap, and which personal-account transaction details become shared.
- [ ] On Monthly Budget, open **About budget states**. Draft/Active/Closed match
      enabled actions. Closed planned amounts are read-only, but historical actuals
      are not claimed to be frozen. Missing amounts and explicit zero are distinct.
- [ ] Read annual-target help beside plan/default and allocation controls. Changing
      the household default or plan start never claims to rewrite existing monthly
      budgets. Selected months, independent copies, cents, and protected states are
      explained. Enable Draft replacement: its overwrite/no-Undo warning is visible
      even while help is collapsed; cancel confirmation and verify no changes.
- [ ] On CSV Import/Review, help distinguishes upload, correction, approval, and
      **Create approved transactions**. Explain why approval alone does not change
      actuals and why Exclude differs from Neither budget. Bulk page/all-matching
      scope and skipped rows match the implemented controls.
- [ ] Critical sharing and deletion/discard consequences stay visible without
      opening help. Cancel Draft deletion/import discard: existing data remains;
      confirmation explains that ledger transactions are not deleted by these actions.
- [ ] Open an inline disclosure while a budget, import row, or account form is dirty:
      no save, approval, changed value, or guard clearing occurs. Follow **Read more**,
      cancel leaving, and verify corrections/selected context stay intact. Accept
      leaving only on disposable edits. Ctrl-click/new-tab retains the correct topic.
- [ ] Visit **Settings → Help** and every deep link. Reload, Back, Forward, and topic
      switching show the intended article/current-topic indicator; unknown IDs give
      a safe fallback. Help starts no tutorial and makes no financial/progress writes.
- [ ] Read `/help` anonymously, with no household, and while unverified. Return links
      fit that state, no financial navigation is exposed, and financial API gates
      remain enforced. Household-load failures do not prevent static help access.
- [ ] Keyboard-only: Tab reaches named help summaries, Enter/Space toggles them,
      Tab reaches the deeper link, Escape closes and returns focus. No focus trap or
      inaccessible hover content. Help routes/topics have meaningful headings,
      current-page state, visible focus, Skip, and the shared route announcements.
- [ ] At narrow/tablet/desktop sizes and real 200% browser zoom, disclosures and
      topic navigation wrap, content remains readable without page overflow, and
      expanded help does not enlarge the fixed Save bar. With a screen reader, verify
      disclosure state, topic heading navigation, list meanings, and warning text.

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
- [ ] CodeQL has analyzed the current PR commit. New High/Critical findings are
      resolved or have a documented, reviewed disposition before merging.
- [ ] Annual-target links to existing monthly budgets open the correct year, month,
      and Household/Personal scope. Selected CSV profile templates download from
      the current household's internal template endpoint.
- [ ] URL-encoding regression tests pass: delimiter/HTML-looking dropdown values
      stay within their encoded query value or path segment, do not add markup,
      and do not inject extra query parameters or fragments (#157 security follow-up).

## First-time user and household onboarding

- [ ] A new uninvited user is guided to create a household.
- [ ] A new invited user who signs in and confirms their email sees the matching
      pending invitation before the create-household form, without requiring the
      invitation email link. Unverified users first see confirmation guidance.
- [ ] An invitation can be accepted after the invited user registers, signs in,
      and confirms email ownership.
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
- [ ] Listing, previewing, and accepting an invitation require the matching,
      verified signed-in email address.
- [ ] A member can leave a household when household rules permit it.
- [ ] The last owner cannot leave without satisfying the ownership rules.
- [ ] A multi-household user can switch households from the persistent header.
- [ ] Switching households refreshes all household-scoped pages and counts.
- [ ] A Viewer can view allowed information but cannot perform owner/member writes.
- [ ] Direct API or copied-URL access cannot cross household boundaries.

## Household settings regression (#138)

Open Manage household → Settings. Use Development/Scratch and disposable
households; currency changes are permitted only before financial setup/data.
See [household settings](household-settings.md). The automated integration suite
uses SQLite; also run the conflict/race cases on the normal SQL Server test app.

- [ ] Name, time zone, default fiscal-year starting month, and default currency
      display the selected household's current settings. The header and section
      navigation clearly identify the household and active page.
- [ ] Owner and Admin can save; Editor and Viewer can view but not save. Direct
      PUT requests, including yearly-plans/default-start-month, enforce the same
      permissions. An outsider, former member, or unauthenticated user cannot
      read or change the household. Editor annual/monthly budget editing still works.
- [ ] An unused household with only categories can change currency. Accounts
      (including private/archived ones), staged imports, saved monthly budgets,
      annual plans, transactions, and recurring expenses lock it. The UI explains
      the disabled control without exposing private financial details.
- [ ] Load settings for an unused household, then create financial data in another
      tab before saving a currency change. The server rejects the whole settings
      save; no partial name/fiscal update or activity event is left behind.
- [ ] Save valid name/time-zone/fiscal changes with locked currency. Existing
      transaction dates/amounts, account currencies, monthly budgets, annual plan
      periods/targets, and recurring expenses remain unchanged. A new unsaved
      annual plan uses the new default; a saved plan retains its own start month.
- [ ] Invalid/blank/long names, unsupported currency/time-zone IDs, invalid months,
      and missing/stale versions fail safely and preserve entered values.
- [ ] Successful saves create one household-visible activity event with only the
      changed settings. Failed, denied, stale, and unchanged saves create no event.
- [ ] Save from two tabs with the same version: the stale write cannot overwrite
      the first. Repeat a previously committed request and verify no duplicate
      change/event. Check simultaneous submissions in SQL Server too.
- [ ] Dirty route/tab changes, sign-out, household switching, Refresh, Cancel, and
      browser unload warn. Cancel keeps values and household selection. Confirmed
      household switching loads the new household without carrying old edits over.
- [ ] A failed save retains edits and protection. A conflict/permission response
      requires a confirmed reload before another save. Rapid clicks/Enter while
      saving do not issue multiple writes; Retry loading issues reads only.
- [ ] Initial read failure stops Loading and offers Retry without displaying an
      empty settings form. Refresh failure marks retained settings stale and
      disables writes. Revoked read access hides retained settings. A genuinely
      unselected household receives a clear next step without requesting settings.
- [ ] Successful saves update the header/household switcher without changing the
      selected household, forcing focus away, or reloading away the editor.
- [ ] All labels and help text are associated with controls. Check keyboard-only
      selection, saving/canceling, skip navigation, section navigation and heading
      focus; also check screen-reader output, narrow widths and actual 200% zoom.
- [ ] Annual Targets has only its per-plan start-month editor and a shared-default
      explanation/settings link. Canceling that link preserves annual edits; there
      is no second household-default form or storage source.

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

## Accessible page navigation regression (#178)

Run in Development/Scratch with a keyboard and a supported screen reader. These
are manual sign-off cases, not claims established by automated DOM tests. See
[the shared behavior guide](accessible-page-navigation.md).

- [ ] On first load, Tab reveals Skip to main content before sidebar/header
      controls. Enter moves to the main heading (main landmark if no heading),
      closes the mobile menu when open, and skips repeated navigation. Shift-Tab
      and subsequent Tab continue in a sensible order.
- [ ] Skip does not change the URL, append Back history, prompt about unsaved
      edits, or discard them. Existing main IDs still work.
- [ ] Sidebar and budgeting section navigation announce the exact current page.
      On Annual targets/overview, Monthly budget is not also marked current.
      Collapsed icon links retain their accessible names and visible focus.
- [ ] Navigate between Dashboard, Accounts, Transactions, Import/Review, budgets,
      Tutorials, Categories, and Household. Browser titles identify each page;
      focus moves to the destination heading and the page change is announced.
      Repeat for login/register/recovery/invitation/setup routes with disposable
      accounts; titles must not contain query tokens or private financial values.
- [ ] Repeat with browser Back/Forward. A canceled unsaved-change prompt keeps
      the page/title and does not focus/announce the destination. Accepting it
      focuses the actual destination once.
- [ ] Change transaction filters, row pagination/filtering, year/month, or
      Household/Personal scope. Focus stays with the operated control; no new
      page announcement is generated merely by same-page updates/query changes.
- [ ] Switch households from the header with clean edits, and with disposable
      unsaved edits (Cancel and Leave). The switcher retains focus; an accepted
      switch resets household-specific editor state and loads the correct data.
      No old household draft or private data remains in the new editor.
- [ ] Delay a destination's lazy page load. Focus does not land on a hidden old
      page or jump to the loading fallback. When ready, focus reaches the new
      heading; if the user interacted while waiting, readiness is announced
      without stealing their chosen focus.
- [ ] Replay Getting started. Its coach retains focus priority across route
      changes; page navigation does not fight it or jump to a heading on Exit.
- [ ] At 200% actual browser zoom and approximately 390px width, repeat Skip and
      navigation with the menu open/closed and desktop sidebar collapsed. Focus
      rings and headings are visible, not clipped by scrolling/sticky navigation;
      all required controls remain reachable without a keyboard trap.
- [ ] Open monthly and annual calculators using the keyboard. Calculation is
      focused; trigger expansion/relationship and the non-modal calculator name
      are announced. Tab can leave normally. Escape from input, keypad, Close,
      or trigger closes and returns focus without applying/saving an amount.
- [ ] Calculator Close returns focus. Enter evaluates only; Use result applies
      once and returns focus. Invalid arithmetic stays open with an announced
      error. Repeat near the bottom of a long page and at 200% zoom/narrow width;
      Close/keypad/result controls can be reached by keyboard and scrolling.

## Tutorial resilience regression (#177)

Use Development or Scratch. These are permanent manual cases, not a record of
completed browser testing. See [the implementation guide](tutorial-resilience.md).
Only tutorial progress metadata may change during the existing Learn-only tour.

- [ ] Start/replay Getting started with the mobile menu closed at 760px, 800px,
      and 880px. Each required navigation link becomes visible and clickable.
      Repeat after resizing during a step; no hidden link is accepted as ready.
- [ ] Run with the desktop sidebar collapsed. Icon links remain reachable and
      named; the tour does not change the saved collapse preference.
- [ ] Repeat at actual browser 200% zoom, including a short/narrow viewport.
      Coach content can scroll; Exit, Back, and recovery actions remain reachable;
      the required target is not covered by the coach when interacting with it.
- [ ] Complete the tour with only Tab, Shift-Tab, Enter/Space, and Escape. Focus
      starts at the coach heading, reaches both coach and highlighted link, and
      does not escape to household switching, sign-out, forms, or other links.
- [ ] Use Read highlighted area / Go to highlighted control. Focus moves without
      clicking or saving. Informational headings are readable; Customize and form
      controls in Learn-only spotlights cannot be operated.
- [ ] With a screen reader, hear step instructions/recovery feedback and reach
      the intended highlighted area and coach region. Unrelated inert background
      actions are absent from normal browse/control navigation. No false modal
      announcement hides the intended target.
- [ ] On disposable preview data, use the browser element inspector to hide or
      remove the current target (or delay a lazy page). After five seconds, waiting
      stops and explained Retry target / Skip step / Exit controls appear. Restore
      the element: the tour recovers automatically. Repeat after a target had
      already been found. Retry never invokes a save, import, invite, or deletion.
- [ ] Back changes route/step and focuses the new coach. Exit and Escape release
      background controls and restore launch focus, or the current page heading if
      the launcher was removed. Replay does not receive delayed focus from Exit.
- [ ] With a dirty editor, attempt a required navigation click; Cancel prompts
      once, retains edits and the step, and does not advance. Leave advances normally.
      Test Back and Finish route guards too. Prefer disposable edits.
- [ ] Block only `/api/tutorial-progress` requests. A failed progress save is
      explained; Exit/Escape/Finish still dismiss the overlay immediately. No
      financial/configuration request is sent by recovery or Learn-only steps.
- [ ] Finish returns to Tutorials and records completion when connected. Exit
      can resume its checkpoint; Replay starts at step one. Planned guided tours
      remain Coming soon rather than accidentally becoming enabled.
- [ ] When guided tours are added, missing required actions expose Retry/Exit
      without Skip; only explicitly skippable information can be skipped. Recovery
      must never execute the intended financial/setup action automatically.

## Unsaved-change protection regression (#157)

Use disposable Development or Scratch data. These are manual checks to run, not a
record that browser testing has already passed. The shared implementation is
described in [the unsaved-change protection guide](unsaved-change-protection.md).

Repeat the relevant checks for monthly budgets, annual targets and the household
fiscal-year default, transaction edits, staged import corrections, CSV uploads,
accounts, categories/subcategories, categorization rules, CSV import profiles,
recurring expenses, invitation forms, and household creation/setup.

- [ ] Opening a page or an existing editor without changing values does not warn.
- [ ] Changing a value, then returning it to its original value, removes the warning.
- [ ] With unsaved values, try a sidebar link, section link, and Return to dashboard.
      Cancel keeps the values, page, URL, and selection; Leave prompts once and navigates.
- [ ] Try browser Back and Forward with unsaved values. Cancel restores the current
      URL and values without adding duplicate history entries; subsequent Back and
      Forward still work after leaving or saving.
- [ ] Cancel a household switch. The header, stored household choice, and editor
      stay in the original household. Accept a switch and verify the new household
      loads without carrying unsaved values into it. Selecting the same household
      does not warn.
- [ ] Cancel sign-out and verify no logout happens. Accept sign-out and verify it
      prompts once; a failed logout leaves the editor protected.
- [ ] Cancel monthly budget month/year/scope changes and annual plan year/scope
      changes. Values and selections remain unchanged. Accept and verify the newly
      selected data loads. Selecting the existing value does not warn.
- [ ] Cancel replacing an edited row, canceling an editor, or resetting a form.
      Entered values remain. Accept and verify only the intended editor is discarded.
- [ ] A successful save clears that editor's warning. A failed save retains values
      and the warning so the user can retry. Saving one form does not clear another
      dirty form on the same page.
- [ ] On Annual targets, cancel navigating to Household settings with unsaved
      target amounts; all edits remain. Saving a per-plan start-month change does
      not alter the household default. Shared-default editing is only in settings.
- [ ] On import review, cancel row Refresh and navigation/filter/import changes
      while corrections are unsaved. Explicitly clear a category, hide and reveal
      that row, and verify it remains cleared. Failed bulk saves remain protected.
- [ ] A selected CSV file is protected before upload. A successfully uploaded file
      ready for review no longer triggers the unsaved-upload warning.
- [ ] Refresh or close a tab after interacting with a dirty form. Where the browser
      permits it, its native warning appears; Cancel keeps the page. Repeat after
      saving and verify there is no unsaved-change warning. Native warning text is
      controlled by the browser, not BudgetApp.
- [ ] Complete or exit a tutorial with a dirty editor. Canceling navigation does not
      advance or complete the tutorial. Normal tutorial navigation still works.

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
- [ ] Private personal transactions remain visible only to their account owner;
      explicitly Household-included transactions expose only the shared projection.
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

## Transaction budget inclusion (#182)

Use fictional CAD 1,200 rent in a personal account owned by User A. User B must
belong to the same household. Verify against a separate Household and Personal
monthly budget; the planned amounts do not need to match.

- [ ] Apply `AddTransactionBudgetInclusion` to Development/Scratch; verify existing
      Household/Personal totals and excluded transactions remain unchanged.
- [ ] Import rows initially use the source account's old default: Household only
      or the account owner's Personal only.
- [ ] During review, select Personal + Household; save individually and using
      Save all corrections; choices survive refresh, row filters, and pagination.
- [ ] Bulk budget inclusion supports Personal only, Household only, both, and
      neither. Verify current-page versus all-matching scope across more than
      100 rows, cancellation, preview counts, and keeping typed corrections.
      Apply stages changes; Save all corrections persists them. Excluded,
      linked, and permission-protected rows are skipped, and changed approved
      rows require review again. A failed bulk save keeps the staged choices.
- [ ] Category rules preserve inclusion choices. Approval/completion creates only
      one transaction; repeating completion or re-uploading does not bypass the
      existing duplicate safeguards.
- [ ] An approved row with neither budget selected still creates a ledger row.
      An excluded review row creates no transaction.
- [ ] The same CAD 1,200 counts once in A's Personal and once in Household actuals;
      no split amount or duplicate category line appears.
- [ ] Change inclusion later on Transactions; monthly, prior-month/history, and
      annual totals update; planned budgets, annual targets, and statuses do not.
- [ ] Repeat with Draft, Active, and Closed budgets. Closed actuals remain live,
      consistent with existing reporting behavior.
- [ ] User B sees only the shared date, amount, currency, category, description,
      source/status and generic private-account label. Private account ID/name,
      notes, merchant, posted date, account details, raw CSV/import are unavailable.
- [ ] B cannot change A's financial details or Household inclusion, even as Admin.
      B can add/remove the visible transaction from B's own Personal budget without
      changing A's Personal selection.
- [ ] A Viewer can choose their own Personal inclusion but cannot change Household
      inclusion, including on a personal account they own.
- [ ] Unsharing a private expense hides it from B and B's Personal reports; B's
      stored inclusion choice does not grant access to private data.
- [ ] A shared-account row selected for Personal belongs to the selecting reviewer,
      not whichever member completes the import. Other reviewers cannot reassign
      that choice; after completion they can independently add their own choice.
- [ ] Budget/currency/spending/date/category filters and annual drill-downs reconcile
      with the report. Expense refunds, income, uncategorized rows, voided rows,
      currency mismatches, and deactivated categories retain the existing rules.
- [ ] List pagination and CSV export contain one row per transaction; exports
      display inclusion and redact private source details.
- [ ] Changing account scope does not automatically rewrite saved inclusion.
- [ ] Failed saves retain edits; route/filter/page/household changes warn; Reset
      requires confirmation. Saving one row does not discard another row's choices.
- [ ] Two-tab saves return a reload conflict rather than overwriting newer choices.
- [ ] Household Activity contains safe shared change summaries; Personal choices
      and private notes/account information do not leak into household activity.
- [ ] Test checkbox, save, reset, and reload controls with keyboard and narrow layout.

See [transaction budget inclusion](transaction-budget-inclusion.md) for rollout
instructions and the privacy contract.

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
- [ ] Click annual total, parent category, subcategory, individual month, and
      uncategorized spending links in both Household and Personal scopes. Active
      filters preserve period, inclusion, currency, and category/spending rules.
- [ ] Use more than 100 matching transactions. Matched amount covers every page
      and reconciles with the clicked report amount; changing pages does not
      change that total. CSV export includes all matching rows exactly once.
- [ ] Include refunds, income, transfers, excluded/voided rows, deactivated
      categories, and mixed currencies. Drill-downs retain the report rules,
      and clearing currency shows separate totals rather than one combined sum.
- [ ] Edit filter controls without applying: results/export retain active filters
      and the page explains the pending change. Apply or Reset: the view is marked
      as changed. Restore report filters returns to the original matching set.
- [ ] Unsaved transaction/inclusion edits are protected when restoring report
      filters, changing pages, switching household, or returning to the report.
- [ ] Return to Annual overview preserves year and scope. A different household
      does not claim to match the original report. After another user edits saved
      transactions, reloading the report reconciles the latest totals.
- [ ] Empty results show a zero for the selected currency. A failed list/refresh
      hides unreliable totals and offers Retry without silently clearing filters
      or discarding another row's unsaved choices.
- [ ] A shared private-account row remains redacted for other members in list
      and export; private-only rows do not contribute to their matching totals.
- [ ] Empty-category, empty-budget, and empty-transaction years render safely.

## Annual financial accessibility regression (#179)

Use Development/Scratch fixtures and record the browser, screen reader/version,
viewport, and actual browser zoom. See
[the annual accessibility guide](annual-financial-accessibility.md). Automated
semantic tests do not replace live screen-reader or zoom sign-off.

- [ ] In both Household and Personal Annual overview, navigate the category table
      with a screen reader. Its caption identifies scope, year, and currency;
      every amount announces the correct category and Budgeted / Actual /
      Remaining / Average actual per month measure.
- [ ] Check root and subcategory rows without relying on color or indentation.
      Children identify their parent path, and root totals explain that they
      include subcategories. Duplicate names remain associated with the correct
      row. Deactivated and long category names remain understandable.
- [ ] Compare missing budgets with saved zero budgets: No budget is not a zero,
      and missing remaining is explained rather than an unexplained dash.
      Negative actual/average values have their sign and Negative amount text;
      negative remaining has its sign and Over budget text.
- [ ] Category links remain keyboard reachable and open transactions with the
      correct category, year, budget inclusion, currency, and household context.
      Report values still reconcile; the presentation does not alter calculations
      or combine overlapping Household and Personal totals.
- [ ] At approximately 390px width and at actual 200% browser zoom, the page stays
      within the viewport. Focus the named category-table region and scroll
      sideways with arrow keys to reach every column; focus remains visible,
      headers remain available, and long names do not overlap amounts. Tab and
      Shift-Tab can enter/leave the region and reach its category links.
- [ ] Empty category responses and future/partial-year average explanations remain
      clear. Existing loading, stale, failure, and Retry states still work.
- [ ] In Household settings, Default fiscal-year starting month has a visible label
      and announces its explanation. It is clearly distinct from Fiscal year
      begins for the current plan on Annual Targets. Editor/Viewer users cannot
      save the shared default, including through the compatibility endpoint.
- [ ] Change the household default with the keyboard, verify unsaved-change
      protection, then save once. New unsaved plans use it; the selected saved
      annual plan and existing monthly budgets do not change. No allocation or
      annual-target write occurs as a side effect.

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

### Page-load feedback — Annual overview, Annual targets, Monthly budget, Household

Repeat these checks on each of the four pages. Use a disposable Development
household and browser request blocking/offline controls; do not use Production
or real invitation recipients for failure injection.

- [ ] Delay the initial read: Loading is announced; unknown counts/totals are not
      presented as zero, and no unknown-budget creation/replacement is offered.
- [ ] Fail the initial read: Loading stops, "Could not load" appears with Retry
      loading, and the page does not also claim no budgets/targets/members exist.
- [ ] Restore connectivity and Retry: the current selection loads without any
      save, email, draft-creation, allocation, or deletion request being repeated.
- [ ] Load a genuinely empty response: appropriate empty/zero states appear and
      creation is offered only where the successful response permits it.
- [ ] After a successful load, fail Refresh data: retained information is marked
      as potentially out of date; editing/write actions are unavailable; Retry
      restores fresh data. Repeat with a previously empty response.
- [ ] On monthly budgets and annual targets, enter changes before Refresh:
      canceling the discard prompt preserves values; failed saves preserve values
      and navigation protection. Household email/role survive read refreshes.
- [ ] Fail the existing-budget list on annual targets: no "Will create Draft"
      preview or replacement action is available based on the unknown list.
- [ ] Allow an invitation, allocation, or draft deletion to succeed, then fail its
      refresh: acknowledged success is clear; retry issues reads, not another write.
- [ ] Allow leaving/deleting a disposable household to succeed, then fail the
      membership-list refresh: retry the list without repeating the exit operation.
- [ ] Delay an old month/year/scope/household read, change selection, and let the
      newer read finish first: the delayed response does not replace current data.
- [ ] Revoke access while data is displayed: a denied refresh hides the records,
      rather than retaining a stale authorized-looking view.
- [ ] Test status/error announcements and retry buttons with keyboard and screen
      reader. Repeat at narrow width; no broad layout changes are expected.

### Windows encryption-key lifecycle (#150)

Use a disposable installation with fictional data and a NEW ring, never delete,
corrupt, revoke, or broaden permissions on the live Production ring for a test.
Follow [Windows key storage and recovery](production-key-storage.md).

- [ ] Record the launching Windows account; initialization uses that account and
      a new directory outside publish/Git. Cancellation and repeat initialization
      never overwrite existing keys or change financial data.
- [ ] Key directory and dedicated private-key file permit only that identity,
      SYSTEM, and trusted local Administrators. A different ordinary Windows
      account cannot read/write key XML or decrypt it. Web app administrator
      grants do not grant Windows secret access.
- [ ] Sign in, obtain an antiforgery token, confirmation/reset/change-email link,
      and pending email-MFA challenge. Restart/redeploy into another release
      directory with the same ring/configuration; each remains valid until its
      original expiry/security-stamp rules say otherwise.
- [ ] Generate a protected backup, keep its password separately, and restore
      into a NEW isolated directory. The pre-backup probe verifies. Repeat under
      another trusted Windows identity/machine without already installed private
      certificates to prove portable recovery.
- [ ] Failed/canceled backup or restore is not labeled verified; partial new
      artifacts are clearly inspected, not promoted. Existing destinations are
      rejected and the live ring/startup/DB remain unchanged.
- [ ] On a disposable copy: missing/empty ring, deleted key/manifest, wrong
      certificate, corrupt key XML, wrong name, broad ACL, and denied write access
      stop startup/checks without creating substitute keys. No key XML, codes,
      certificate password, or token values are pasted into logs/issues.
- [ ] Ordinary key rotation retains old keys and original cookie/link expiry;
      wrapping-certificate rotation retains old private certificates. Back up
      ALL retained certificates and verify old and new probes after restore.
- [ ] Inherited Production path/certificate settings do not redirect Development
      or Scratch to real keys. Default Testing keys leave no filesystem material.
- [ ] First adoption and pre-#150 code rollback require fresh login/Identity links
      deliberately; user records, budgets, transactions, and MFA recovery hashes
      are preserved. Hosted-provider QA remains #204 before internet exposure.

### General persistence and recovery

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

### Reusable interface QA for new or changed pages

Apply this gate to every new or materially changed page, including Household
settings (#138) and Account settings (#156). Record browser/assistive technology,
viewport/zoom, role/scope, result, and a defect link for failures.

- [ ] The registry label/browser title and main h1 make the page's purpose clear.
      There is one visible main landmark; Skip reaches it and Tab then continues
      into meaningful content.
- [ ] Current-page state is exposed in sidebar/section navigation; accepted page
      transitions focus/announce predictably, but local filters/saves do not steal
      focus. Loading, failure, successful empty, and stale states are distinct.
- [ ] Inputs have associated labels; icon-only controls have names. Keyboard and
      screen-reader users can identify values, instructions, errors, and actions.
- [ ] Focus remains visible at 200% zoom/narrow width. No essential action is
      clipped or trapped; temporary interfaces have reachable dismissal and
      deliberate focus return.
- [ ] Dirty edits, cancellation, household switching, and Household/Personal
      permissions preserve the right context and do not expose another user's data.
- [ ] Test successful use, rejected/failed writes, retry, refresh, and at least one
      keyboard/screen-reader path; add permanent automated/manual regression cases.

Use this template for a new manual case:

```text
- [ ] [Workflow] Starting from [precondition], when [action] is performed,
      [expected result] occurs and remains correct after [refresh/restart if relevant].
```
