# Email Infrastructure

BudgetApp has provider-neutral backend email infrastructure for password recovery,
household invitations, email confirmation/address changes, and future application messages. It can send real mail
using an authenticated SMTP service, including a dedicated personal Gmail account.
The application itself can remain local while sending email over the internet.

## Current Delivery Modes

| Mode | Environment | Behavior |
| --- | --- | --- |
| `Disabled` | Any environment | Does not deliver; dispatch reports failure rather than claiming delivery |
| `File` | Development only | Writes matching `.txt` and `.eml` files to a local development outbox |
| `Smtp` | Any environment | Sends HTML and plain-text email over required TLS using backend credentials |

Production defaults to `Disabled`. BudgetApp refuses to start if `File` delivery
is selected outside the Development environment. Development defaults to `File`;
real SMTP is enabled explicitly through user secrets. Invalid SMTP configuration
fails at startup without logging credential values.

## Gmail setup for Visual Studio

Use a dedicated personal Gmail account for MC Budget. No domain purchase or paid
Google Workspace subscription is needed for this local-testing setup.

1. Enable [Google 2-Step Verification](https://support.google.com/accounts/answer/185839).
2. Open [Google App passwords](https://myaccount.google.com/apppasswords) while
   signed into the new Gmail account and generate one named **BudgetApp**.
3. From PowerShell, run the repository's setup script:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\clayb\source\repos\clroscott\BudgetApp\tools\configure-gmail-email.ps1"
   ```

   The script prompts for the Gmail address and hidden app password. It finds the
   server project relative to itself, preserves existing database secrets, removes
   the grouping spaces from Google's app password, and passes settings to .NET
   over stdin rather than putting the password in command-line history.
4. Restart BudgetApp in Visual Studio. SMTP credentials are checked on delivery,
   not by sending a message at startup.
5. Request recovery for an **existing Development account** with an inbox you can
   access, or create a household invitation to your test recipient.

The script defaults links to `https://localhost:57251`, the current frontend URL.
For a different HTTPS frontend URL:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\clayb\source\repos\clroscott\BudgetApp\tools\configure-gmail-email.ps1" `
    -ApplicationUrl "https://localhost:57251"
```

Settings saved by the script:

| Configuration key | Value |
| --- | --- |
| `Email:DeliveryMode` | `Smtp` |
| `Email:SenderName` | `MC Budget` |
| `Email:SenderAddress` | Dedicated Gmail address |
| `Email:Smtp:Host` | `smtp.gmail.com` |
| `Email:Smtp:Port` | `587` |
| `Email:Smtp:Security` | `StartTls` |
| `Email:Smtp:Username` | Same full Gmail address |
| `Email:Smtp:Password` | Google app password, not the normal account password |
| `Email:Smtp:TimeoutSeconds` | `30` |
| `Application:PublicBaseUrl` | The frontend URL you open |

The invocation permits this script only for that PowerShell process; it does not
change the machine's execution policy.

User secrets are outside Git but are **not encrypted**. They are for Development;
do not use `dotnet user-secrets list` in shared logs or screenshots. BudgetApp
deliberately reloads Development user secrets after the other configuration
providers, so saved Development settings take priority over inherited Production
environment variables. Restart the app after changing settings.

Google app passwords require 2-Step Verification and may be unavailable for
accounts using only security keys, Advanced Protection, or managed organization
policies. Changing the Google password revokes app passwords. See
[Google's requirements](https://support.google.com/accounts/answer/185833).
Google recommends OAuth where available; OAuth is a separate implementation if
app-password access is unavailable for this account.

Personal Gmail documents sending limits around 500 sent emails per day, with
temporary restrictions for excessive sends or bounces. Treat Gmail as a small
local/testing sender, not a guaranteed high-volume delivery service. See
[Gmail sending limits](https://support.google.com/mail/answer/22839) and
[SMTP connection details](https://developers.google.com/workspace/gmail/imap/imap-smtp).

To return to the development files or disable sending, use the absolute project
path (independent of the current working directory):

```powershell
dotnet user-secrets set "Email:DeliveryMode" "File" --project "C:\Users\clayb\source\repos\clroscott\BudgetApp\BudgetApp\BudgetApp.Server\BudgetApp.Server.csproj"
# Or use "Disabled" instead of "File". Restart the app afterward.
```

## Gmail setup for the local deployed app

Production does not load Development user secrets. For the current Windows local
deployment, save a separate Windows-protected SMTP credential while signed in as
the Windows user who runs the app. This is analogous to the certificate credential
already used by the startup script:

```powershell
New-Item -ItemType Directory -Path "C:\Apps\BudgetApp\secrets" -Force | Out-Null
$gmailCredential = Get-Credential -UserName "your-dedicated-account@gmail.com" `
    -Message "MC Budget Gmail: enter the Google app password, not the account password"
$gmailCredential | Export-Clixml -LiteralPath "C:\Apps\BudgetApp\secrets\gmail.credential"
$gmailCredential = $null
```

Add the following before launching `BudgetApp.Server.exe` in the existing startup
script. Keep its existing database and HTTPS certificate settings:

```powershell
$gmailCredential = Import-Clixml -LiteralPath "C:\Apps\BudgetApp\secrets\gmail.credential"
$env:Email__DeliveryMode = "Smtp"
$env:Email__SenderName = "MC Budget"
$env:Email__SenderAddress = $gmailCredential.UserName
$env:Email__Smtp__Host = "smtp.gmail.com"
$env:Email__Smtp__Port = "587"
$env:Email__Smtp__Security = "StartTls"
$env:Email__Smtp__Username = $gmailCredential.UserName
$env:Email__Smtp__Password = $gmailCredential.GetNetworkCredential().Password.Replace(' ', '')
$env:Email__Smtp__TimeoutSeconds = "30"
$gmailCredential = $null
# Set this to the local HTTPS frontend address recipients actually use.
$env:Application__PublicBaseUrl = "https://localhost"
```

On Windows, the exported credential is encrypted for that Windows user and
computer. Restrict access to the secrets folder. A different service identity or
host requires its own credential provisioning. Environment variables are process
configuration, not an encrypted storage mechanism; remove the email variables
when the app exits if reusing that shell. Do not copy credentials into the publish
folder, React settings, Git, or screenshots.

A localhost email link works only on the computer hosting that app. A LAN/private
hostname must resolve to the app and have trusted HTTPS on recipient devices.
Sending real email does not make the application publicly reachable. Public-site
hosting and verified-domain delivery remain later deployment work.

## Delivery failures and troubleshooting

SMTP requires TLS (`StartTls` or `SslOnConnect`) and normal server-certificate
verification. There is no plaintext fallback or setting to bypass certificates.
Each delivery has its own connection and a total timeout. The app does not
automatically retry SMTP sends, because a timeout can occur after a provider
accepted a message and retries could duplicate recovery/invitation emails.

Logs contain purpose plus a controlled failure category, never raw SMTP responses,
credentials, recipient addresses, bodies, or links:

| Category | Check |
| --- | --- |
| `Authentication` | Full Gmail username, matching app password, 2-Step Verification, password revocation |
| `SecureConnection` | SMTP host/port/security settings, trusted certificate, TLS interception |
| `Rejected` | Provider quota, sender authorization, recipient address, bounce restrictions |
| `Timeout` / `Connection` | Network access to the SMTP host, firewall, provider availability |
| `Disabled` | Effective delivery mode |

An accepted SMTP message is not proof of inbox delivery; check Sent mail, the
recipient's spam folder, and subsequent bounce notifications. Recovery always
returns the same generic response, including for unknown accounts or delivery
failure. Invitation failures preserve the pending invitation and offer **Resend**.
Disabled mode also reports that no delivery occurred.

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

Before real delivery is enabled, configure the actual HTTPS frontend origin that
the intended recipient can reach. It can be local for this phase.

## Architecture

The Application project owns:

- `IEmailSender`;
- provider-neutral email messages and purposes;
- the password-recovery, household-invitation, and email-ownership templates;
- `IApplicationEmailLinkBuilder`;
- a dispatch service that reports delivery failure without throwing into the
  underlying household or authentication operation.

Infrastructure owns:

- `FileEmailSender`;
- `DisabledEmailSender`;
- `SmtpEmailSender`, using MailKit;
- configured application-link generation;
- replaceable SMTP client creation and backend configuration.

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
- successful dispatch and safe failure reporting;
- local SMTP exchanges proving TLS precedes authentication and both message
  formats arrive, plus certificate rejection, timeout, cancellation, and safe errors;
- recovery/invitation persistence when email delivery fails.

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
5. In File mode, open `%LOCALAPPDATA%\BudgetApp\development-email`.
   In SMTP mode, open the recovery recipient's inbox (including spam).
6. Open the newest password-recovery file or delivered email.
7. Follow the recovery link and set a password of at least 12 characters.
8. Confirm the old password is rejected and the new password signs in.
9. Reopen the same link and confirm it is rejected because it has already been
   used.

Use Development test accounts and recipient inboxes you control. Production
defaults to Disabled unless SMTP is configured explicitly.

Household invitation testing uses the same outbox. See
[Household invitations](household-invitations.md) for the complete acceptance,
resend, and revoke flow.

## Changing providers and remaining scope

Changing SMTP providers does not change the Application interface or templates.
Update the host, port, TLS mode, username/password, and provider-approved sender.
An API-only provider can be added through a separate `IEmailSender` implementation.
Provider credentials must be supplied to the backend through local secrets or
environment configuration and must never be placed in React configuration,
source control, normal logs, or generated client assets.

[Account email confirmation (#149)](email-ownership.md) uses the same sender and
configured URL. File-mode confirmation messages use `email-confirmation` and
`email-change` filenames. External public hosting,
verified-domain sending, and production volume/bounce management still require
the later deployment/provider work; this phase is real email from the local app.
