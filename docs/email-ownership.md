# Account email ownership (#149)

## User behavior

- Registration requests a confirmation email and returns a generic **Check your email** response. The registration page then signs in through the normal credential endpoint using the details just entered, avoiding a second password entry. The password is not kept in browser storage. Duplicate addresses receive the same registration response and no extra email; automatic sign-in succeeds only if the entered credentials are valid. If sign-in is unavailable, generic guidance and manual sign-in/recovery remain available.
- Open the confirmation link and explicitly choose **Confirm email address**. The same signed-in browser does not need another login before or after confirming. A different browser/profile/device still needs to sign in as the matching account; the email link is not a login credential. Merely opening a link never verifies or changes an account.
- Unverified users are redirected to a dedicated **Confirm your email** page (`/verify-email`). They cannot access household, budget, transaction, import, report, settings, or tutorial data until verified. Existing budgets, transactions, memberships, and preferences are kept unchanged and become accessible again after confirmation.
- The gate provides **Send confirmation link**, **Check confirmation status**, account recovery, and sign-out. It quietly checks status when the unverified user returns to the tab, so confirmation elsewhere exposes **Continue** without another login. Temporary refresh failures retain the page, and checks do not resend email or reset edits/focus. `/resend-confirmation` remains an alternate entry to the same page. Account maintenance remains accessible; there is no automatically sent resend loop.
- Invitation listing, link previews, and both acceptance endpoints require a verified, matching account. Anonymous visitors must sign in first. An unverified account does not receive household names, invitation counts, or acceptance access just because its email matches.
- If someone registered an address they do not own, the recipient should not confirm an unexpected request. They can recover the password, sign in, request a fresh confirmation link, and then confirm. Password recovery invalidates old sessions and old confirmation links; it does not automatically verify an address.

## Reusable backend contract used by #156

All writes require a signed-in session and an antiforgery header.

| Endpoint | Request | Result |
| --- | --- | --- |
| `POST /api/auth/resend-confirmation` | `{}` | Generic `202` message for the signed-in user's current address |
| `POST /api/auth/confirm-email` | `{ userId, token }` | Updated current-user response, or generic invalid/expired/replaced/used/wrong-account `400` |
| `POST /api/auth/request-email-change` | `{ newEmail, currentPassword }` | Generic `202`; invalid current credentials/address get `400` |
| `POST /api/auth/confirm-email-change` | `{ userId, token }` | Updated current-user response, or the same generic confirmation failure |

`GET /api/auth/me`, login, and confirmation responses include `emailConfirmed`.
Registration now returns `{ message }` with status `202`, not a user or a login cookie.

The backend gate runs for app API requests before controller actions; unverified
sessions receive `403` with `code: EmailConfirmationRequired`, even when calling
an endpoint directly. Only public endpoints and explicitly marked account
maintenance bypass it. New app APIs inherit the gate. Sign-in remains allowed
so users can complete verification and recover their account. The client does
not load household data or tutorial progress before confirmation and keeps the
intended return URL and saved household selection for afterwards.

Email changes require the current password. The old address and its verification status stay in effect while confirmation is pending. The pending address is stored server-side and the link does not include it as a query parameter. Successful completion atomically updates both email and email-based username, marks the new address verified, and consumes the proof. The completing session is then refreshed. Household/financial ownership remains attached to the same user ID.

Duplicate target addresses, cooldowns, and delivery failures share the same request response. A target claimed between request and confirmation cannot partly change the original account. The server rechecks availability at completion. [Account settings (#156)](account-settings.md) now supplies the form and own-account pending-status view; it reuses this service/API rather than implementing another confirmation system.

`/settings/account` is a client-gate account-maintenance exception, including for
unverified users without households. It can correct a mistyped address, change a
password/name, and resend current-address proof. Financial access remains blocked.

## Tokens, resend limits, and delivery

The implementation uses ASP.NET Core Identity's protected confirmation/change-email tokens and `EmailConfirmed` flag, rather than trusting a client flag. See [Microsoft's Identity confirmation guidance](https://learn.microsoft.com/en-us/aspnet/core/security/authentication/accconfirm?view=aspnetcore-10.0) and [Identity's email-token validation implementation](https://source.dot.net/Microsoft.Extensions.Identity.Core/UserManager.cs.html).

- Links expire after **one hour**, matching the configured Identity token-provider lifespan. The stored expiration is also checked at use.
- Only the latest proof for each purpose is accepted. Resending replaces the stored SHA-256 hash. Successful use consumes its state. The raw token is not stored in SQL or routine logs.
- State in the existing `AspNetUserTokens` table records purpose, hash, expiry, request timestamp, current normalized email, and (for changes) pending email. There is **no schema migration**.
- A persistent **one-minute per-account, per-purpose cooldown** limits delivery across sessions, restarts, and app instances. Requests within the cooldown do not automatically send again.
- The four ownership endpoints additionally allow **five requests per account per minute** by default (`EmailOwnershipRateLimit:PermitLimit`). HTTP `429` includes clear retry guidance and `Retry-After`. The HTTP limiter is per running instance; the durable delivery cooldown is shared through the database.
- SQL Server serializes requests against the user row and wraps completion in a transaction. Email and username changes cannot be partly committed. Isolated tests use SQLite; SQL Server lock/concurrency behavior remains a manual deployment check.
- Ordinary confirmation of the existing address keeps signed-in sessions valid: it does not change credentials, and each app request checks the current database verification flag. Password changes/recovery and email-address changes invalidate other sessions immediately through Identity security-stamp validation. Only the finishing session is refreshed for those credential changes. Confirmation still requires both a matching signed-in account and its latest valid inbox proof; it never logs an anonymous visitor in by itself.
- Delivery uses the existing File/SMTP/Disabled sender. State is committed before dispatch. Failure does not delete the account or change its address, and does not expose another account's existence. There is no automatic resend loop: wait a minute, explicitly retry, check spam, and contact the installation administrator if delivery still fails.
- File-mode messages have `email-confirmation` and `email-change` filename slugs. The configured `Application:PublicBaseUrl` controls all links.

## Deployment and verification

Publish both client and server. No database-update command is needed specifically for #149. Do not run a SQL update to mark existing addresses confirmed: each owner must prove access to their inbox.

Before deploying, confirm email delivery is configured and the frontend HTTPS origin is reachable on recipient devices. Previously unverified existing accounts must confirm once before regaining app access; no data is deleted and no bulk emails are sent on deployment. Disabled or broken delivery prevents those accounts completing verification, so test the delivery/URL path before rollout. Already verified accounts keep access. Public hosting/key-storage/encryption launch gates remain separate work. Rolling back to older application code can remove the gate; do not treat an old build as equally protected.

Automated coverage includes registration privacy, explicit/matching-account confirmation, tampering, expiry, replacement, replay, durable cooldown, HTTP rate limits, existing-account transition with preserved household/budget records, read/write API gating across application areas, invitation privacy on every entry path, password-recovery takeover, session invalidation, duplicate addresses, email changes, delivery failures, CSRF, safe URLs/templates, File-mode purposes, and client gate/return/recovery behavior.

Manual Development/Scratch cases are in [the permanent QA checklist](manual-qa-regression-test-plan.md#email-ownership-and-email-changes-149). Use only test accounts and inboxes you control. Real SMTP arrival, intended-device URL reachability, rendered responsive/keyboard/screen-reader behavior, and concurrent SQL Server requests need live checks.
