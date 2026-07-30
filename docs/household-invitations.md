# Household Invitations

BudgetApp owners and administrators can invite another person to an existing
household from the **Household** page. Invitations are stored separately from
memberships because the invited person may not have a BudgetApp account yet.

## Permissions

| Actor | Roles they may invite |
| --- | --- |
| Owner | Admin, Editor, Viewer |
| Admin | Editor, Viewer |
| Editor | None |
| Viewer | None |

All active household members can view the current member list. Only Owners and
Admins can view pending invitation email addresses, send invitations, resend
them, or revoke them.

## Invitation Lifecycle

1. An Owner or Admin enters an email address and chooses an allowed role.
2. BudgetApp creates a pending invitation that expires after seven days.
3. The configured backend email sender receives a link containing the
   one-time invitation token.
4. The invited person opens the link and signs in or registers.
5. BudgetApp requires the signed-in account's normalized email address to match
   the invitation.
6. Acceptance creates an active `HouseholdMember` and marks the invitation
   accepted in the same database operation.

Resending rotates the token and starts a new seven-day expiry period. The old
link immediately stops working. Revoking an invitation also prevents
acceptance. Accepted, revoked, and expired invitations remain visible as
history.

BudgetApp currently allows an account to participate in one active household.
An account that already has an active household cannot accept another
invitation until it leaves that household or deletes an eligible unused
household.

## Recovering From the Wrong Household

The invitation page links a signed-in member to Household management and
preserves the invitation return path.

- Admin, Editor, and Viewer members may leave. The household and its financial
  data remain intact for its Owners.
- An Owner may permanently delete a household only when they are its sole
  member, it has no accounts, transactions, imports, budgets, recurring
  expenses, import profiles, or categorization rules, and its categories still
  match the original defaults.
- An Owner cannot leave a household that continues to exist. Ownership
  transfer is intentionally deferred to a later phase.
- Customized or financially active households cannot use the unused-household
  deletion endpoint.

After a successful leave or deletion, BudgetApp returns to the original
invitation so it can be accepted immediately.

## Security

- Only a SHA-256 hash of the invitation token is stored in SQL Server.
- The raw token exists only in the intended invitation link passed to the email
  infrastructure.
- Tokens, email bodies, and recipient addresses are excluded from normal
  technical logs and audit details.
- Management and acceptance operations enforce household authorization on the
  server; hiding controls in React is not treated as authorization.
- Invitation acceptance is recorded in the append-only household activity
  history.

## Development Test

Production email delivery remains disabled until a provider is configured.
Development writes safe-to-open `.txt` and `.eml` messages to:

```text
%LOCALAPPDATA%\BudgetApp\development-email
```

To test the full flow:

1. Start BudgetApp from Visual Studio in Development.
2. Sign in as a fictional household Owner.
3. Open **Household**, invite a different fictional email, and select a role.
4. Open the newest household-invitation file in the Development outbox.
5. Follow its link and register using exactly the invited email address.
6. Accept the invitation and confirm the shared household opens.
7. Sign back in as the Owner and confirm the new member and accepted invitation
   appear on the Household page.

Useful negative checks are attempting to reuse the link, using a different
account email, and revoking or resending before acceptance.

## API

```text
GET  /api/households/{householdId}/members
POST /api/households/{householdId}/invitations
POST /api/households/{householdId}/invitations/{invitationId}/resend
POST /api/households/{householdId}/invitations/{invitationId}/revoke
GET  /api/household-invitations/preview?token={token}
POST /api/household-invitations/accept
POST /api/households/{householdId}/leave
DELETE /api/households/{householdId}/unused
```
