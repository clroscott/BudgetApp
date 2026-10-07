# Security and Encryption Review

Review date: 2026-09-30  
Scope: GitHub issue #109  
Current decision: **approved for trusted local testing; not yet approved for public Internet exposure**

This document defines BudgetApp's security baseline and the remaining launch gates.
It is not a claim that the application is vulnerability-free. Revisit it when the
hosting topology, email provider, database edition, or authentication model changes.

## Executive summary

BudgetApp already has a useful application-security foundation:

- ASP.NET Core Identity hashes passwords; plaintext passwords are not stored.
- Authentication uses a host-only, Secure, HttpOnly, SameSite=Strict cookie.
- Every unsafe API request is subject to antiforgery validation.
- Authentication endpoints have IP-based rate limiting and failed-login lockout.
- Normal application controllers require authentication, and application services
  enforce household membership and personal-data ownership.
- Invitation tokens contain 256 bits of cryptographic randomness and only their
  SHA-256 hashes are stored.
- Password recovery does not reveal whether an account exists.
- CSV files have byte and row limits; the original uploaded file is not retained.
- Logs use IDs and operation metadata instead of passwords, tokens, connection
  strings, transaction contents, or uploaded files.

The application must not be placed on the public Internet yet. The principal
blockers include a selected and hardened hosting perimeter,
explicit Data Protection key storage, and an encryption plan for the SQL Server
Express database and its backups.

2026-10-06 follow-up: #149 implements account email ownership with a full app-access gate,
generic registration responses, and immediate security-stamp session checks.
Automated coverage is recorded in [Email ownership](email-ownership.md); live SMTP,
recipient-device, and concurrent SQL Server checks still require QA. This does
not change the overall public-hosting decision or close other launch gates.

## Lightweight threat model

| Area | Assets and trust boundary | Credible threats | Existing controls | Remaining work |
| --- | --- | --- | --- | --- |
| Accounts | Passwords, auth cookies, reset links | Credential stuffing, brute force, session theft, account enumeration | Identity password hashing, 12-character minimum, lockout, rate limiting, Secure/HttpOnly/SameSite cookie, generic recovery response | Verify email ownership; add MFA/recovery-code decision; define session revocation and abuse monitoring |
| Households | Membership, roles, shared financial data | IDOR, role escalation, cross-household reads/writes | Household authorization service, scoped repository queries, integration tests | Maintain a protected-route/tenant-boundary regression matrix for every new endpoint |
| Personal data | Personal accounts, budgets, transactions, activity | Other household members reading personal records | OwnerUserId checks and personal visibility filters | Keep explicit tests whenever a feature gains Personal scope |
| Invitations | Bearer invitation link and invited email | Token theft, email impersonation, replay | Random token, hashed storage, expiry, one-time acceptance, exact email match | Account-visible invitations require confirmed email; do not treat an unverified account email as proof of ownership |
| Imports | Financial CSV content and staging rows | Oversized upload, malicious spreadsheet content, data leakage, duplicate writes | Request/file/row limits, parsing validation, filename normalization, staged review, spreadsheet-safe export | Retain size-limit tests and never log or archive complete uploaded files by default |
| Secrets | TLS certificate password, connection string, provider credentials, Data Protection keys | Source-control leak, log leak, host compromise | Empty committed connection string, User Secrets in Development, process-scoped Production values, DPAPI-protected local certificate credential | Select a production secret store and explicitly persist/protect Data Protection keys |
| Deployment | Public hostname, TLS termination, host firewall, reverse proxy | Plain HTTP, spoofed forwarded headers, Host-header abuse, unpatched runtime | HTTPS Kestrel setup, secure cookies, HSTS and response-header middleware | Select direct Kestrel vs reverse proxy; set exact AllowedHosts; configure forwarded headers only for known proxies; automate patches and service identity |
| Database and backups | MDF/LDF, temp files, `.bak` files | Stolen disk or backup, unauthorized SQL login, MITM to remote SQL host | Windows Integrated Security; least-secret connection string | Enable volume/database encryption and encrypted backup storage; validate SQL TLS certificate for any remote connection |

## Findings and launch gates

### SEC-001 — Email ownership (#149 implementation; live verification pending)

Identity confirmation and change-email tokens now provide expiring, single-use
proof for account email ownership. Pending listing, invitation previews, and
both acceptance paths require a confirmed matching address. Possession of an
invitation token alone is no longer enough to reveal details to an unverified
account. The registration API is generic and does not issue a login cookie. The
registration interface follows it with the normal rate-limited credential check
using the already entered password, rather than making the user type it twice.

`RequireConfirmedAccount` remains false intentionally so users can sign in to
confirm, resend, recover, or sign out. A separate backend gate requires
`EmailConfirmed` for app-data APIs, and the client redirects unverified users
to a dedicated confirmation page without loading financial/household data.
Existing accounts must confirm once; their data is kept, not deleted or reset.
Password and email-address changes invalidate other sessions immediately through
security-stamp validation. Ordinary confirmation of the unchanged address keeps
existing sessions usable; all app access checks the DB verification flag. A proof
cannot sign in an anonymous visitor and must still match the signed-in account.

Automated regression coverage includes expiry/replacement/replay, existing
accounts, impersonated registration and password recovery, email changes,
duplicate addresses, resend limits, delivery failures, and invitation metadata
privacy. Complete the corresponding live QA and hosting-provider checks before
public launch; see [Email ownership](email-ownership.md).

### SEC-002 — Internet hosting topology is undecided (launch blocker)

Choose and document one topology before exposure:

- **Direct Kestrel:** listen only on intended interfaces, use a publicly trusted
  certificate, expose only 443, and keep SQL Server off the public network.
- **Reverse proxy:** terminate TLS at the proxy, restrict the backend listener to
  the proxy, and configure ASP.NET Core forwarded headers with explicit known
  proxy/network values. Never trust arbitrary forwarded headers.

For either topology:

- set `AllowedHosts` to the exact public hostname(s), not `*`;
- set `Application:PublicBaseUrl` to the exact HTTPS origin;
- redirect or reject HTTP and verify the HSTS header;
- run under a dedicated, non-administrator service identity;
- expose no SQL Server, certificate, secrets, logs, backups, or email-outbox
  directories through the web root;
- define OS, .NET, Node/build, SQL Server, and certificate-renewal patch ownership.

### SEC-003 — SQL Express data and backup encryption need an environment control (launch blocker)

The current local deployment uses SQL Server Express. Microsoft documents that SQL
Server Express does not support Transparent Data Encryption or native encrypted
backup creation. Therefore the current edition cannot satisfy this requirement by
turning on a SQL option.

Choose one supported plan:

- keep Express and encrypt the Windows data and backup volumes with BitLocker (and
  use an independently encrypted destination for every portable/off-machine copy);
- move to a SQL edition/service that supports TDE and encrypted backups; or
- use a managed database whose documented at-rest and backup encryption meets the
  deployment requirement.

Record key/recovery-material ownership and perform a restore rehearsal. Encryption
without a tested recovery path can turn a hardware failure into permanent data loss.

### SEC-004 — Data Protection key lifecycle is implicit (launch blocker)

Identity cookies, antiforgery values, and password-reset tokens rely on ASP.NET Core
Data Protection. Before installing as a service or using multiple hosts, configure:

- a stable key-ring location outside the replaceable publish folder;
- encryption of that key ring at rest (DPAPI for one Windows identity/machine, or a
  certificate/key vault for a multi-host design);
- file permissions limited to the application service identity;
- backup/rotation/recovery behavior and the consequence of key loss.

Do not copy an unprotected key ring between machines.

### SEC-005 — SQL TLS currently skips certificate validation

Development and current local-production examples use
`TrustServerCertificate=True`. The channel is encrypted, but the server certificate
identity is not validated. This is tolerable only for the documented same-machine,
trusted local SQL Express setup. A remote database must use a verifiable certificate
with `Encrypt=Strict` (or `Encrypt=True;TrustServerCertificate=False`) and an expected
server name.

### SEC-006 — Repository security features require enablement

The 2026-09-30 review found GitHub secret scanning, push protection, and Dependabot
security updates disabled. The repository now contains:

- weekly Dependabot configuration for NuGet, npm, and GitHub Actions;
- pull-request dependency review that rejects newly introduced High/Critical
  vulnerable dependencies;
- npm audit (including build dependencies), lint, and automated test steps in the
  PR build.

A repository administrator must still enable Dependabot alerts/security updates,
secret scanning, push protection, non-provider patterns, and validity checks under
GitHub **Settings → Advanced Security**. No secret should be committed to test these
features.

### SEC-007 — Email delivery must change before Internet use

File delivery intentionally writes password-reset and invitation bearer tokens to
disk and remains Development-only. Public deployment requires a real provider,
credentials from a production secret store, TLS to the provider, delivery-failure
monitoring, and retention controls. Never place the file outbox under the publish or
web-root directory.

## Encryption decisions

| Data | Current protection | Internet deployment decision |
| --- | --- | --- |
| Passwords | ASP.NET Core Identity salted password hashes | Keep framework defaults current; never add reversible password encryption |
| Auth/antiforgery/reset tokens | ASP.NET Core Data Protection; invitations use random bearer tokens with stored SHA-256 hashes | Configure durable protected key storage; retain short expiry and one-time use |
| Browser traffic | HTTPS, Secure cookies, HSTS in non-Development, restrictive response headers | Use a publicly trusted certificate and verify HTTP cannot serve authenticated traffic |
| App-to-SQL traffic | Integrated Security; encrypted but unvalidated local SQL certificate | Validate the certificate for any remote SQL connection |
| MDF/LDF and temp data | Deployment/environment dependent | BitLocker/TDE/managed-service encryption, documented and verified |
| Database backups | Plain SQL Express backups unless the storage layer protects them | Encrypt the destination or change SQL edition/service; test restore and key recovery |
| Financial fields | Normal SQL columns for query/report behavior | **No application-level field encryption now.** Add it only for a documented threat with query impact, key rotation, backup, and recovery design |
| Logs and audit events | IDs, action metadata, summaries; error files retained locally | Restrict ACLs and retention; never add passwords, bearer tokens, connection strings, full CSV rows, or unnecessary transaction details |

## Implemented during this review

- Browser security headers: CSP, frame denial, MIME sniffing denial, strict referrer
  policy, permissions policy, and cross-origin isolation headers.
- `Cache-Control: no-store` on API responses.
- HSTS in non-Development/non-Test environments.
- Kestrel server-version header disabled.
- HTTPS-only configured public base URLs for email links.
- Request-size enforcement added to import-profile CSV inspection.
- Automated tests for headers, cookie attributes, antiforgery, and the protected API
  surface.
- Dependabot and pull-request dependency review configuration.

## Review evidence

On 2026-09-30:

- A full npm audit initially found two High issues in transitive build dependencies
  (`nanoid` and `sharp`). The lockfile was updated to patched versions, after which
  `npm audit --audit-level=high` reported 0 vulnerabilities.
- NuGet vulnerable-package audit, including transitive dependencies: no known
  vulnerable packages in Application, Domain, Infrastructure, Server, or Tests.
- Secret-pattern review found committed placeholders and documentation examples,
  not live provider keys/passwords/tokens.

Dependency results are time-sensitive. CI and GitHub alerts must remain enabled.

## Pre-Internet approval checklist

- [ ] Email confirmation is implemented and required where email ownership grants access.
- [ ] A real email provider and secure credential storage are configured.
- [ ] Hosting topology, public hostname, TLS termination, and proxy trust are documented.
- [ ] `AllowedHosts` contains only intended public hostnames.
- [ ] Data Protection keys are durably stored, encrypted, access-controlled, and recoverable.
- [ ] Database files, logs, temporary files, and backups have verified at-rest encryption.
- [ ] Remote SQL connections validate the SQL Server certificate.
- [ ] SQL Server is not reachable from the public Internet.
- [ ] GitHub secret scanning, push protection, and Dependabot security updates are enabled.
- [ ] All automated tests and the manual QA/security regression sections pass.
- [ ] Backup restoration and certificate/key recovery are rehearsed.
- [ ] External security testing is performed against the chosen deployment topology.

## Primary references

- [Microsoft: Enforce HTTPS in ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/security/enforcing-ssl)
- [Microsoft: ASP.NET Core Data Protection key storage](https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/implementation/key-storage-providers)
- [Microsoft: Protect Data Protection keys with Windows DPAPI](https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/implementation/key-encryption-at-rest)
- [Microsoft: SQL Server edition security-feature matrix](https://learn.microsoft.com/en-us/sql/sql-server/editions-and-components-of-sql-server-2025)
- [Microsoft: SQL Server backup encryption](https://learn.microsoft.com/en-us/sql/relational-databases/backup-restore/backup-encryption)
- [Microsoft: SQL client encryption and certificate validation](https://learn.microsoft.com/en-us/sql/connect/ado-net/connection-string-syntax)
- [GitHub: Repository security quickstart](https://docs.github.com/en/code-security/getting-started/quickstart-for-securing-your-repository)
- [GitHub: Dependency review action](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/manage-your-dependency-security/configure-dependency-review-action)
