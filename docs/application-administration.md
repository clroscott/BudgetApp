# Application administration (#130)

This is an installation-level account-support area, **not** a household admin role
or an unrestricted super-user mode. No access is granted by default, by registration,
or because someone is the first user or a household Owner/Admin.

## One-time setup

1. Stop the Development app and apply the audit and administrator-grant migrations.
   They add separate tables and change no existing financial or Identity columns.
   From the repository root, run:

   ```powershell
   .\tools\Update-DevelopmentDatabase.cmd
   ```

   This resolves absolute project paths from the script location, uses Release to
   avoid Visual Studio Debug-file locks, and fixes the database to `BudgetAppDb_DEV`.
   Its default SQL instance is `BIG-Z\SQLEXPRESS`; pass `-ServerInstance` if your Dev
   instance differs (use the `.ps1` directly for that parameter). The `.cmd` wrapper
   handles execution policy in a separate process, without permanent policy changes.
   It restores your process environment afterward and stops on
   tool/update failures. It applies all pending Development migrations, not just this
   one. **It is not a production deployment script.** Use the existing deployment
   procedure for production after QA. This implementation did not run the update.
2. Start the app. Register/sign into your intended owner account, confirm its email
   and enable MFA under personal Account settings. Save its recovery codes. Stop the app.
3. Run the initial-owner tool from the repository root:

   ```powershell
   .\tools\Setup-DevelopmentOwner.cmd
   ```

   Enter the existing account email. Review the displayed **Development** environment,
   server and `BudgetAppDb_DEV` catalog, then type `SETUP OWNER` to explicitly confirm.
   The tool exits without starting a web listener. It requires server access and does
   not ask for UUIDs or store credentials. It records the bootstrap and attempts a
   private notification. It never grants access merely because someone registered first.
4. Restart the app and sign in again with MFA. Open **Application administration →
   Administrators**, or `/admin/administrators`. It works without a household.
5. From this page, search an existing account by email, select **Support administrator**
   or **Installation owner** (or remove access), enter a reason, and confirm using your
   current password and fresh MFA. The affected person is notified and signs in again.
   No application restart is needed for subsequent access changes.

The database is the only authority for grants. Legacy `AppAdministration:AdministratorUserIds`
configuration/secrets are **ignored**, not imported or combined with database grants.
If you previously ran the UUID secret command, use the email-based initial setup now;
the old secret may be removed later. Development and Production have separate grants.
The setup tool refuses to run a second time—even if someone removes every grant by
editing the database. Lost-owner recovery requires a separate reviewed protocol.

For Production, use the published server executable on the server with its existing
protected Production configuration: `BudgetApp.Server.exe --bootstrap-owner "EMAIL"`.
Review its environment/catalog before confirming. The Development wrapper is never
a production setup/deployment tool. No real grant, database update or email was made
as part of this implementation.

## Administrator roles

- **Support administrator:** account-support tools and private audit; cannot appoint
  administrators or change application-admin accounts through support actions.
- **Installation owner:** all support tools plus administrator-grant management.
  Every grant/removal needs a fresh, purpose-bound password/MFA approval and reason.
  Recipients must have verified email, MFA and available sign-in before receiving access.
  Removing/demoting an owner, or disabling owner MFA, must leave another eligible owner.
  Concurrent mutations serialize through an installation-level database gate.

Role changes rotate the affected account's security stamp, invalidating old sessions
and pending authorization/recovery proofs. Own-role changes explicitly sign out the
operator. Neither role grants financial-data visibility outside normal household rules.

## Supported tasks

- **Users:** `/admin/users` automatically lists existing accounts, 20 per page,
  ordered by email with a stable account-ID tie-breaker. Optional name/email filtering
  does not need three characters; clear it to browse all users again. Rows show name,
  email ownership, MFA, application role and current lockout only. No household or
  financial data, credentials or codes are included. Both administrator roles can
  browse; only owners see administrator-management shortcuts. Account links fetch
  fresh detail/status in the existing support/access screens and never execute writes.
  Loading, zero matches, failure and retained stale data stay distinct. Revoked access
  hides retained users; retries and pagination perform only GET requests.
- Search account email/display name (at least three characters, at most 25 results),
  then load fresh status: confirmed email, email MFA on/off, lockout, account UUID.
  No password hash, stamp, OTP, recovery code, household list, budget or transaction
  is returned. Normal household visibility remains unchanged.
- **Send password-reset email:** reuse the existing expiring, single-use password
  recovery flow, to the account's unchanged verified email. Operators cannot see,
  choose, or retrieve the password. This does not turn off MFA.
- **Send MFA-recovery email:** request a 15-minute, single-use, 256-bit random link
  to the unchanged verified email. Requesting/sending/opening it changes no credentials.
  The recipient must explicitly provide the link and their current password. Only
  then are old recovery codes and sessions invalidated and ten new codes shown once.
  **Email MFA stays ON**; recovery does not sign the user in. A fresh MFA sign-in is
  required. This resets the current email-MFA/recovery-code state, not a future
  authenticator-app/phone enrollment that has not been implemented.
- **Revoke sessions:** rotate the security stamp. Do not delete or edit financial
  data, change email, turn off MFA, or unlock sign-in. Attempt a private notification.
- **Administrative audit:** paginated private history of execution attempts,
  successful actions, delivery results, and completed MFA recovery. No edit/delete
  endpoint; household activity does not include these events. Timestamp, actor UUID,
  target UUID, action, reason and result are recorded; no passwords/codes/tokens.

Support tools intentionally reject **all designated application-administrator
targets, including yourself**. Use personal Account settings for routine changes;
privileged-account recovery/last-operator recovery needs a separate reviewed protocol.
The separate owner-only Administrators page changes privileges, not passwords/MFA.
No impersonation, financial browsing, account/household deletion, arbitrary email
changes, forced email confirmation, or global MFA-disable switch.

## Failure and recovery behavior

- Every operator endpoint enforces the named backend policy: a current database grant,
  confirmed email, enabled MFA, and a completed MFA session. Household permissions
  never satisfy it. Administrator management additionally requires the owner role.
  All POSTs (including public recovery) require antiforgery protection.
- OTPs keep the existing account-wide expiry, resend cooldown and attempt limits;
  new operations do not reset them. Support recovery emails also have a target/action
  cooldown. Failed passwords use Identity lockout, including on recipient recovery.
- Recovery stores only the random token's hash and binds it to the current email,
  target/actor security stamps, granting operator, expiry and delivery state. Changing
  email/password, revoking sessions, replacing the link, removing the granting
  operator, or disabling their MFA makes the link unusable. Undelivered links fail closed.
- SQL Server user-row locks and serializable transactions protect code consumption,
  revocation and audit writes. Actor/target locks are acquired in a stable UUID order.
  Real SQL Server concurrent-request verification remains a manual QA item.
- A submitted operation's UUID is also its durable ledger key. Repeating that same
  operation returns the recorded result, never repeats the mutation/email. A different
  actor or changed metadata cannot reuse it. SMTP happens after the ledger commits.
- Lost responses offer **Check recorded result**; no automatic mutation retry. A
  definite rejection response instead preserves the reason and permits an explicit
  new-password/MFA approval attempt; passwords and proofs are still cleared. A
  request interrupted during SMTP may remain `PendingDelivery`, and a notification
  may arrive later. Check the audit/provider before explicitly starting a new action.
  There is no background retry queue in this task.
- Passwords/proofs are only transient form values and are cleared after completion,
  failure or cancellation. No credentials/recovery codes are put in browser storage.
  The public recovery page removes its link token from the address bar on loading.
  Lost once-only-code responses require another explicitly authorized recovery request.

## Deferred recovery policy

Verifying identity when a user has lost **both registered email access and all
recovery codes** is a separate issue. This implementation provides no bypass, manual
operator password assignment, replacement-email shortcut, or unconditional MFA-off
button. Do not use it to circumvent that boundary. More granular operator permissions, dual approval,
stronger operator MFA methods, tamper-evident external audit retention, account
suspension and global authentication-method policy are also separate work.

Design references: [ASP.NET authorization policies](https://learn.microsoft.com/en-us/aspnet/core/security/authorization/policies?view=aspnetcore-10.0),
[OWASP MFA recovery](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html#resetting-mfa).
