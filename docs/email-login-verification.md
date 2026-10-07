# Optional email login verification (#135)

## Test it in Development

No database migration is required: this feature uses existing Identity user/token
tables. Existing accounts remain unenrolled. Restart the app after building.

1. Sign in with an account whose current email address is confirmed.
2. Open **Account settings → Additional login verification → Set up email verification**.
3. Enter the current password and request a code. This does not enable verification yet.
4. Enter the eight-digit code from the existing configured email delivery system
   and select **Enable verification**.
5. Save the ten recovery codes offline before acknowledging the once-only display.
6. Sign out and sign in again. The password step must stay on the verification
   screen; the account/settings/household APIs remain unauthorized until an email
   or recovery code succeeds. Reloading this screen resumes the pending session
   without automatically resending or requesting the password again.
7. Try one recovery code. It works once and does not disable verification.
8. In Account settings, try replacing codes or disabling verification. These
   actions require the password and fresh proof for that specific action.
9. Once disabled, password-only sign-in returns and the dashboard reminder appears.

Use a disposable test account and the Development database. Do not intentionally
exhaust real-account recovery codes or simulate failures on production email.

## Behavior and boundaries

- Optional per account; separate from required email-ownership confirmation.
- Email is the only enrolled method in this release. Recovery codes are a fallback,
  not a trusted device or an automatic security reset.
- Eight-digit cryptographically random email codes expire after five minutes;
  challenges expire after ten minutes, including after resend. Resending replaces
  the old code and requires a one-minute cooldown across verification emails for
  the account. This can also apply immediately after enrollment/security changes.
- Five failed code attempts in a fifteen-minute account-wide window cause a
  fifteen-minute login lockout. Starting another password step or resending does
  not reset that attempt budget. Request endpoints also have the existing IP
  authentication rate limiter. Password lockout still applies.
- Delivery failures never enable verification or complete sign-in. The pending
  challenge provides explicit resend/recovery; an undelivered email code cannot
  authenticate even if exposed by a failing test transport.
- Recovery codes contain 128 bits of random entropy, are stored only as hashes,
  and are consumed atomically. Plain codes are returned only on successful
  enrollment/replacement. They are not stored in browser persistence or retrievable
  from settings. A lost success response may require fresh proof to replace codes.
- Password changes and requesting replacement email require purpose-bound fresh
  proof when verification is on. Current email stays in use until its replacement
  is confirmed. Email replacement preserves verification and redirects future
  codes to the newly confirmed address. Password reset does not disable verification
  or create an authenticated session.
- Enrollment, disabling, and code replacement rotate the Identity security stamp,
  invalidate older pending challenges and other application sessions, and attempt
  a private security-notification email. Notification delivery failure is logged
  safely and does not roll back a successfully authorized security change.
- Security settings never enter shared household activity or mutate financial data.

## Storage/session details

`AspNetUsers.TwoFactorEnabled` records enrollment. `AspNetUserTokens`, under the
`BudgetApp.LoginVerification` provider, holds separate purpose-bound challenges,
saved recovery-code hashes, and durable counters. SQL Server user-row locks plus
serializable transactions coordinate writes/consumption across application processes.
No in-memory-only rate/consumption state is used.

Email codes are protected with the application's ASP.NET Data Protection key ring
(not stored as plaintext or as easily brute-forced numeric-code hashes). Challenge
state is bound to user, purpose, normalized current email, security stamp, and expiry.
Keep the existing production Data Protection key-storage/recovery plan; this feature
does not implement that separate hosting/security issue. Recovery hashes do not
depend on decrypting an email code.

The secure, HttpOnly, host-only, SameSite Strict verification cookie uses a distinct
Identity scheme. It contains only temporary challenge context and cannot authorize
normal app APIs. Completed sessions carry proof of successful verification; Identity
principal refresh preserves proof from the validated cookie, never from an account
flag. Old password-only sessions cannot acquire that proof by refreshing.

## Deferred work

Authenticator apps/phone/passkeys, multiple enrolled methods, trusted devices,
application-admin method policies, mandatory verification, and a general notification
centre are not implemented. Losing both mailbox access and every recovery code has
no self-service bypass. A separately reviewed operator recovery protocol is required;
household Owner/Admin roles cannot reset another person's account verification.

## Verification

Automated integration coverage uses isolated SQLite and recording/failing email
transports, not the user's database or Gmail. UI tests cover pending-session resume,
failure/retry, recovery, once-only display, navigation guards, and sensitive forms.
See the permanent manual checklist for real SMTP, SQL Server concurrent requests,
narrow layout, keyboard, and screen-reader sign-off before deployment.

Design references: [OWASP MFA guidance](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)
and [ASP.NET Core Identity MFA](https://learn.microsoft.com/en-us/aspnet/core/security/authentication/mfa?view=aspnetcore-10.0).
Email verification is a pragmatic additional login check, not phishing-resistant
authentication or a claim of standards-level MFA assurance.
