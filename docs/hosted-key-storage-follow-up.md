# Configure and verify Data Protection keys for the selected internet host

## Goal

Adapt the Windows Data Protection baseline from #150 to the selected
internet-hosting environment before public launch.

Tracked on the Budget App board as [#204](https://github.com/clroscott/BudgetApp/issues/204).

## Prerequisite

Choose the hosting topology under #107. This work is deferred until the host is
selected; no cloud services need to be purchased now.

## Scope

- Choose durable key-ring storage and encryption supported by the actual host:
  a persistent protected volume/certificate, or managed storage and a key vault.
- Use the application's dedicated service/workload identity with least-privilege
  access; keep Development, staging, and Production key rings isolated.
- Preserve a stable application discriminator across releases. Replicas of one
  environment share its intended ring; never use disposable container/release
  directories.
- Plan migration from the Windows ring, including whether existing cookies and
  outstanding Identity links can be retained or must deliberately be reissued.
- Define protection-key and wrapping-key/certificate rotation, retention,
  revocation, backup, and disaster recovery for the selected provider.
- Monitor storage/access/certificate or vault failures without logging secrets.
- Document setup, deployments, service identity changes, restore, and rollback.

## Acceptance criteria

- Restarts, redeployments, release-slot changes, and replicas retain the intended
  ring without silently falling back to fresh or ephemeral keys.
- Unrelated identities cannot read/modify keys or decrypt the ring.
- Cookie, antiforgery, password-reset/email-confirmation, email-change, and MFA
  challenge flows pass tests on the actual hosted deployment.
- Old protected values remain usable through normal rotation for their intended
  lifetimes. Compromise/revocation consequences are documented separately.
- Restore a protected backup and decryption material in an isolated environment;
  verify a pre-backup protected probe.
- Missing storage, keys, wrapping material, and denied permissions fail safely
  with actionable operator guidance.
- Record the host, identity, permissions, configuration, backup location, restore
  result, and remaining limitations as public-launch evidence.

## Boundaries

No blanket administrator access to secrets, financial-data encryption redesign,
or public exposure before hosting/security gates pass. SQL and financial-data
encryption remain #151. Related: #150, #107, #151.
