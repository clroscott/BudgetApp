# Email Infrastructure

BudgetApp has provider-neutral backend email infrastructure for password recovery,
household invitations, and future application messages. It does not currently
send mail over the internet.

## Current Delivery Modes

| Mode | Environment | Behavior |
| --- | --- | --- |
| `Disabled` | Production, Testing, or any environment | Accepts the dispatch request but does not deliver a message |
| `File` | Development only | Writes matching `.txt` and `.eml` files to a local development outbox |

Production defaults to `Disabled`. BudgetApp refuses to start if `File` delivery
is selected outside the Development environment. A real provider will be added
as a separate `IEmailSender` implementation later.

## Development Outbox

Development defaults to:

```text
%LOCALAPPDATA%\BudgetApp\development-email
```

For the current Windows user, `%LOCALAPPDATA%` normally resolves to:

```text
C:\Users\<user>\AppData\Local
```

Each dispatch creates two files with a shared timestamp and identifier:

```text
20260729-190501123-password-recovery-<id>.txt
20260729-190501123-password-recovery-<id>.eml
```

- Open the `.txt` file in any text editor for the simplest view.
- Open the `.eml` file in Outlook or another compatible mail application to
  inspect the message as an email.

These files can contain working invitation or recovery links. Treat the
development outbox as sensitive local data, do not share it, and delete old
messages when they are no longer required. The outbox is not a backup.

To use a different outbox without committing a machine-specific path:

```powershell
Set-Location ".\BudgetApp\BudgetApp.Server"

dotnet user-secrets set `
    "Email:FileOutboxPath" `
    "C:\Users\<user>\Documents\BudgetApp development email"
```

## Public Application URL

Templates build links from `Application:PublicBaseUrl`; they do not hard-code a
localhost address in application code. Development currently uses:

```text
https://localhost:57251
```

Override it through user secrets if the development client uses another origin:

```powershell
Set-Location ".\BudgetApp\BudgetApp.Server"

dotnet user-secrets set `
    "Application:PublicBaseUrl" `
    "https://localhost:57251"
```

Before real delivery is enabled, Production must be configured with the actual
public origin that a recipient can reach.

## Architecture

The Application project owns:

- `IEmailSender`;
- provider-neutral email messages and purposes;
- the password-recovery and household-invitation templates;
- `IApplicationEmailLinkBuilder`;
- a dispatch service that reports delivery failure without throwing into the
  underlying household or authentication operation.

Infrastructure owns:

- `FileEmailSender`;
- `DisabledEmailSender`;
- configured application-link generation;
- future SMTP or API-provider implementations.

Templates include expiration, one-time-use, ignore, and support guidance.
Normal logs record only the email purpose and delivery outcome. They do not
record recipient addresses, message bodies, or invitation/recovery tokens.

Password recovery and household invitations use `EmailDispatchService`.
An invitation is persisted before delivery is attempted. If delivery fails,
the pending invitation remains visible and can be resent without
misrepresenting the household membership state.

## Local Verification

Run the automated email tests:

```powershell
dotnet test `
    ".\BudgetApp\BudgetApp.Tests\BudgetApp.Tests.csproj" `
    --configuration Release `
    --filter "FullyQualifiedName~Email"
```

The tests verify:

- configured URL generation and token encoding;
- expiration and support guidance;
- HTML encoding of household and inviter names;
- matching readable `.txt` and `.eml` output;
- successful dispatch and safe failure reporting.

The file-output test uses a unique temporary directory and removes it after the
test. Password-recovery requests made while running in Development create actual
outbox files.

## Manual Password-Recovery Test

1. Start BudgetApp from Visual Studio in the Development environment.
2. Register a fictional development account, or use an existing Development
   account.
3. Sign out and select **Forgot your password?** on the login page.
4. Enter the account email. The page always displays the same confirmation,
   whether or not the account exists.
5. Open `%LOCALAPPDATA%\BudgetApp\development-email`.
6. Open the newest password-recovery `.txt` or `.eml` file.
7. Follow the recovery link and set a password of at least 12 characters.
8. Confirm the old password is rejected and the new password signs in.
9. Reopen the same link and confirm it is rejected because it has already been
   used.

Use fictional Development accounts only. Production currently uses the
`Disabled` sender and therefore does not produce a recovery file.

Household invitation testing uses the same outbox. See
[Household invitations](household-invitations.md) for the complete acceptance,
resend, and revoke flow.

## Future Provider

Selecting a provider does not change the Application interface or templates.
Provider credentials must be supplied to the backend through local secrets or
environment configuration and must never be placed in React configuration,
source control, normal logs, or generated client assets.
