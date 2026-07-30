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

The invitation and password-recovery workflows have not been implemented yet.
When they are added, they should persist their own state successfully and then
use `EmailDispatchService`. A failed delivery can be shown as retryable without
rolling back or misrepresenting the underlying operation.

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
test. Actual outbox files will begin appearing when recovery and invitation
workflows call the email infrastructure.

## Future Provider

Selecting a provider does not change the Application interface or templates.
Provider credentials must be supplied to the backend through local secrets or
environment configuration and must never be placed in React configuration,
source control, normal logs, or generated client assets.
