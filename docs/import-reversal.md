# Reverse an approved import (#113)

Undo voids the entire batch, marks its import `Reversed`, and retains original
file metadata, drafts, transactions, approval links and worksheet/row provenance.
It never hard-deletes or reopens the original batch. There is no undo-of-undo control.

## Workflow

Open Review imports, select Completed / undone and choose a file, then Preview undo.
If every row is eligible, choose Undo import and confirm the file/account/count.
Canceling changes nothing. Opening, refreshing, paging and closing previews are reads.
Only users who can edit the source account's import see this control. A household
Viewer can still preview their own personal-account import; they cannot preview
household-account reversal or another member's private import. Server checks,
not UI hiding, enforce these boundaries. Outsiders are denied before rows load.

The preview shows source worksheet/row, date, exact amount (up to four decimal
places), description, eligibility and blocker reasons. It exposes the original
import values, not private values from an unexpected linked transaction. Response
rows are bounded to 100 per page with deterministic source-row ordering and a
tie-breaker. Tall/phone tables scroll locally. No action runs merely by opening,
refreshing, paging or closing the preview. Reads are cancelable/context-owned;
access failures clear retained data and other failed refreshes are labeled stale.

## Conservative eligibility

- Only completed imports can be previewed. Imports that created no transactions
  cannot be reversed.
- Every approved row must have one matching official Import-source transaction
  with the same account/household/file/source-row provenance. Missing links,
  missing records, unexpected official transactions and inconsistent retained
  row counters block the batch.
- A voided record or another approval link blocks its row. Any later modification
  timestamp, editable-field/inclusion difference, or recorded non-creation
  transaction audit event blocks its row, including edits later reverted.
- One blocked row blocks the **whole import**; no silent partial undo is implied
  by the count of individually eligible rows.
- Preview is advisory, not a reservation or a token authorizing a later write.
  It includes the import/draft/transaction timestamps for later conflict checks.

Eligibility uses bounded, untracked reads (at most the existing 10,000-row import
limit plus one sentinel for each snapshot list), slim draft projections without
RawData, and one audit-identity query rather than an audit query per transaction.
An oversize legacy history fails closed. This is an explicit preview read,
not an additional background request on every import page load. SQL Server
translation is tested without connecting to any SQL server; SQLite integration
tests use disposable synthetic data. No real SMTP delivery is involved.

The existing schema has no split/reimbursement records. If those are introduced,
their references must be added to eligibility **before** the command permits
reversal of linked transactions. Arbitrary direct database edits cannot be
reliably reconstructed; never infer an absent audit event proves nothing changed.

## Atomic command, recovery and audit

Preview success/rejection emits structured server diagnostics with user,
household/import IDs, eligible/blocked counts or failure type. Descriptions,
amounts, raw data, filenames and security tokens are not logged. Preview reads
create no household activity or domain audit event claiming a reversal occurred.

POST `/api/households/{householdId}/imports/{id}/reverse` requires the existing
anti-forgery protection, explicit confirmation and the preview comparison version.
That SHA-256 identity/timestamp summary is not a bearer credential. The command
reauthorizes and reevaluates every row inside a serializable database transaction.
Existing timestamp concurrency tokens remain active. All voids, Reversed state
and one Import/Reversed audit event commit together; failure/cancellation rolls
everything back. There are no automatic command retries or partial undo.

The audit records actor, time, source import, affected count, prior/new import
versions and confirmed preview version, with original transaction links retained.
Personal-account events use Personal visibility/owner, household-account events
use Household visibility. Summaries omit filenames, descriptions and amounts.
One batch event avoids flooding activity with thousands of row events.

Repeat clicks are disabled during the command. A failed/uncertain write requires
a fresh read, never automatic replay. A lost successful response is reconciled by
reading Reversed and updating the screen. An authorized repeated request returns
the existing result without another audit/void; permissions are still rechecked.
SQL deadlocks/storage failures may return a failed request: refresh status first.
Serializable locks are held for the explicit undo, not for normal preview reads.

Reversed batches are omitted from transaction lists/totals, exports and dashboard
cards. Budgets/annual reports exclude their voided records using existing filters.
Ordinary voided transactions retain existing unfiltered history behavior; this
does not redesign transaction deletion. Inspect undone batches in import/activity
history. Reversed imports remain under Completed / undone and cannot be completed,
discarded or failed. Corrected CSV/Excel files must create a **new staged batch**,
with normal review/approval. The same-file warning still requires explicit allowance;
voided originals no longer match as active duplicates, but other active records do.

No DDL migration is needed: the existing status column stores enum names. Deploy
the matching server/client together. Once Reversed has been recorded, do not roll
back to an older app that cannot deserialize that status; use a forward fix. Never
manually rename statuses or unvoid rows as a deployment workaround.

## Verification (2026-10-15)

- Automated tests use disposable SQLite and fictional browser data, never
  Production or real SMTP. Final run counts are reported with the delivery.
- Synthetic rendered cases at desktop/390/320px cover eligible, blocked,
  failed-read/retry, lost-response reconciliation and household Viewer states.
  Expected undo POSTs are intercepted fictional responses, never forwarded.
- Tests cover CSV/Excel provenance, exact signed/four-decimal values, bounded
  paging, zero-created/unfinished imports, edits including same-timestamp edits,
  voids/inclusion changes, recorded reverted edits, missing links, cross-household
  mismatches with foreign values withheld, no-tracking/no-write reads, permissions,
  oversize/cancellation, structured log keys and SQL Server query translation.
  Command tests also cover blocked/stale writes, failure/cancellation after save,
  idempotency, CSRF, changed permissions, private activity and financial read parity.
- SQL Server translation is tested without a connection. It is not a real SQL
  Server concurrency/load test; chosen-host operational checks remain manual.
- Real-device/zoom/keyboard and human workflow cases remain unchecked in the
  permanent manual plan.
