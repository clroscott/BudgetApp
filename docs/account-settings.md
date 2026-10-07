# Personal account settings (#156)

**Settings → Account settings** opens `/settings/account`. Onboarding and the
verification gate also link here. Signed-in users need no household and can open
settings even before verifying their address or if household loading fails.
This account-maintenance exception does not unlock financial/household APIs.

The three independent sections manage display name, email/verification, and
password. Display names are visible to household members; account security
changes and pending email details are never written to shared household activity.
MFA, account deletion, and submitted-email-request cancellation are not added here.

## Backend and privacy

- `GET /api/auth/settings` returns only the authenticated user's current-user data,
  profile version, and pending email request (address, timestamps, expiration).
  It exposes no proof/hash, delivery status, or another account's eligibility.
  Generic duplicate-address requests appear like other requests, preserving privacy.
- `PUT /api/auth/profile` accepts `{ displayName, version }`. Names are trimmed and
  validated; Identity concurrency stamps reject stale writes with `409`. Display
  names are not credentials and do not require a password or revoke sessions.
- Email changes reuse #149's request/confirmation service. The current password is
  required. The old address stays active and retains its verification status until
  the latest valid replacement proof is confirmed. Expired requests explain how to
  request again. Successful new-address confirmation links back to Account settings.
- Password changes reuse `change-password` with current-password checks and the
  account-security rate limiter. The completing session stays signed in; other
  sessions and old confirmation links are invalidated. Request a fresh link for
  any pending email change after a password change.
- Settings require authentication; mutations require antiforgery. Query/body
  `userId` values cannot retarget another account. No schema migration is needed.

## Editing and recovery

The shared guard covers navigation, household switching, sign-out, and browser
refresh/close. Switching households does not retarget or remount the personal
editor. Delayed household initialization cannot discard its entered values.
Saving one section leaves other edits protected. Passwords exist only in component
memory while typed, never in dirty-state snapshots or browser storage. Email/password
save attempts clear the corresponding password inputs, including on failure; safe
name/address values remain for retry. Clear form does not cancel a submitted request.

Loading, failed reads, stale refreshes, saving, and success are distinct. Unknown/
stale data and pending writes disable saves. A failed read following a successful
write retries only the read. Conflicts retain drafts and require confirmed reload.
Late responses after leaving cannot restore the old account in frontend auth state.

## Verification

Automated cases cover own-account boundaries, no-household/unverified access, CSRF,
password checks, concurrency, pending privacy/expiry/completion, activity privacy,
session behavior, independent forms, guards, failures, secret clearing, and delayed
household loading. A read-only built-client sample checked desktop and a 390px
viewport, long-address wrapping, no horizontal page overflow, and visible keyboard
focus. It used mocked GETs, rejected all writes, never contacted SQL, and sent no email.

Real 200% browser zoom, screen-reader speech, and SMTP round trips remain manual
sign-off cases in [the QA checklist](manual-qa-regression-test-plan.md#account-settings-regression-156).
