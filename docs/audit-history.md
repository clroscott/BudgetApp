# Household Activity and Audit History

## Purpose

The Activity page provides an append-only, household-facing history of
meaningful successful changes. It answers:

- who performed the action;
- when it occurred;
- what kind of record changed;
- whether the event is household or personal;
- what changed when concise before/after details are useful.

It is not a technical application log and it does not provide automatic undo.
Technical requests, exceptions, SQL commands, and diagnostics remain in the
technical logs.

## Privacy

Every event belongs to a household and has one visibility:

- `Household` events are visible to active members of that household.
- `Personal` events are visible only to their owning user.

The API applies both boundaries before filtering, counting, or returning filter
options. Another member's personal activity cannot leak through event results,
actor lists, or counts. Membership in one household never grants access to
another household's events.

Roles do not override personal privacy.

## Recorded Data

An audit event contains:

- household ID;
- actor user ID;
- personal owner user ID when applicable;
- UTC timestamp;
- action;
- entity type and ID;
- concise human-readable summary;
- optional structured details for the expandable view.

Audit details deliberately exclude passwords, password hashes, authentication
tokens, secrets, connection strings, complete uploaded files, and raw CSV row
contents.

## Append-only Behavior

The domain model exposes creation only. The repository exposes adding and
read-only queries only. The server exposes only a `GET` endpoint for audit
events; there is no normal update or delete API.

An audit event is added to the same scoped EF Core context before the related
operation saves. The business change and event therefore succeed or fail
together. Validation failures do not create success events.

## Current Events

The first implementation records meaningful changes for:

- accounts;
- categories and category ordering;
- categorization rules and ordering;
- CSV import profiles;
- CSV upload, correction, review, completion, and discard operations;
- official transaction edits;
- household and personal monthly budgets;
- household and personal recurring expenses.

Household invitation creation, resend, revocation, and acceptance use the same
writer. Audit details record the assigned role but exclude the invited email
address and raw invitation token. A member leaving an existing household is
also recorded. Permanently deleting an unused household removes its household-
scoped audit history along with the household and writes a technical warning
log instead.

Bulk work is summarized as one event with counts rather than producing hundreds
of feed entries. For example, approving an import records the number of rows
approved and transactions created.

## API

```text
GET /api/households/{householdId}/audit-events
```

Supported filters:

- `fromDate`;
- `toDate`;
- `actorUserId`;
- `action`;
- `entityType`;
- `page`.

Results are returned newest first, 50 events per page. Filter options include
only values the current user is allowed to see.

## Adding Future Events

Application services use the shared `AuditWriter` and add the event immediately
before their repository `SaveChangesAsync` call. New events must:

1. describe a meaningful successful business action;
2. use the same personal/household scope as the affected data;
3. include only useful and safe details;
4. avoid one event per row for a bulk operation;
5. have tests for creation and privacy when introducing a new visibility path.

Do not use the Activity feed for page views, filter clicks, routine reads, or
technical exceptions.
