# Authentication

## Scope

BudgetApp uses ASP.NET Core Identity with secure cookie authentication. The React client never stores a password, authentication token, or session identifier in JavaScript-accessible storage.

The authentication scope includes registration, login, logout, current-user
lookup, password changes, forgotten-password recovery, lockout protection, and
antiforgery protection. Email confirmation, external login providers, and
two-factor authentication are deferred.

## Identity Storage

Identity uses GUID user IDs and the following SQL Server tables:

- `AspNetUsers`
- `AspNetUserClaims`
- `AspNetUserLogins`
- `AspNetUserTokens`

Global Identity roles are not enabled. Household roles such as Owner, Admin, Editor, and Viewer will belong to `HouseholdMember` in the domain model.

`AspNetUsers` includes the BudgetApp-specific required `DisplayName` field. Identity manages password hashes, security stamps, lockout state, normalized email addresses, and other authentication metadata. Plaintext passwords are never stored.

## Endpoints

All authentication routes use the `/api/auth` prefix.

| Method | Route | Authentication | Antiforgery | Purpose |
|---|---|---|---|---|
| `GET` | `/antiforgery` | Anonymous | No | Issue an antiforgery cookie and return its request token |
| `POST` | `/register` | Anonymous | Yes | Create and sign in a user |
| `POST` | `/login` | Anonymous | Yes | Validate credentials and issue the authentication cookie |
| `POST` | `/forgot-password` | Anonymous | Yes | Generate password-recovery instructions when an account exists |
| `POST` | `/reset-password` | Anonymous | Yes | Validate a recovery token and set a new password |
| `POST` | `/logout` | Required | Yes | End the current session |
| `GET` | `/me` | Required | No | Return the current user ID, email, and display name |
| `POST` | `/change-password` | Required | Yes | Change the current user's password |

Registration, login, forgotten-password, and password-reset requests are
rate-limited per client address. Repeated failed password attempts lock the
account for 15 minutes after five failures.

## Antiforgery Flow

Before calling a state-changing authentication endpoint, the React client must:

1. Call `GET /api/auth/antiforgery`.
2. Keep the returned `token` in memory.
3. Send the token in the `X-XSRF-TOKEN` header of the following request.
4. Allow the browser to send the associated secure, HTTP-only antiforgery cookie.

The client should request a fresh antiforgery token after registration, login, logout, or another authentication-state change.

Antiforgery validation is applied globally to controller `POST`, `PUT`, `PATCH`, and `DELETE` requests. Future financial write endpoints are protected by default rather than relying on each controller author to remember an attribute.

## Cookie Policy

The authentication cookie:

- Is HTTP-only and unavailable to React code.
- Is sent only over HTTPS.
- Uses `SameSite=Strict`.
- Uses an eight-hour lifetime with sliding expiration.
- Is a session cookie unless login requests set `rememberMe` to `true`.

Authentication failures return HTTP `401`, and authorization failures return HTTP `403`; API requests are not redirected to an HTML login page.

## Password Policy

Passwords must contain between 12 and 128 characters. BudgetApp favors longer passphrases and does not impose uppercase, lowercase, digit, or symbol composition rules.

The login endpoint always uses a generic invalid-credentials response. Logs contain internal user IDs for successful account operations but never passwords, cookies, antiforgery tokens, or email addresses.

## Password Recovery

The login page links to `/forgot-password`. Every syntactically valid email
request receives the same public response, regardless of whether an account
exists. This prevents the endpoint from being used to discover registered email
addresses.

For a matching account, ASP.NET Core Identity generates a protected password
reset token and the configured backend email sender receives a recovery
message. Development writes the message to the local file outbox documented in
[Email infrastructure](email.md). Production email delivery remains disabled
until a real provider is configured.

The recovery link opens `/reset-password` with an opaque user ID and protected
token. The token:

- expires after one hour;
- is validated by ASP.NET Core Identity;
- becomes invalid after a successful password reset;
- cannot be used to determine or change another user's password;
- is never written to ordinary application logs.

Successful reset signs the current browser out and returns it to the login page.
Invalid, expired, incomplete, and previously used links return the same recovery
error. Password-policy errors remain visible so the user can choose a valid
replacement password.

No additional database table or EF Core migration is required. Identity's
configured data-protection token provider supplies and validates the protected
token.
