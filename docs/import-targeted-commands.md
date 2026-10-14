# Targeted staged-import commands (#212, outcome 2)

The second independently verified chunk remains on the #212 branch, per the
owner's 2026-10-14 decision. Outcomes 1 and 2 are committed; client outcome 3 is
left uncommitted for owner review. No schema migration or production operation is required.

## What changes

Single-row corrections, review decisions and removal load only the requested
draft, not the entire tracked import. Bulk corrections load only requested IDs,
in batches of at most 500 SQL parameters, bounded by the existing 10,000-row
import limit. IDs are always constrained to the authorized import.

Global counters come from one SQL aggregate, with old/new contributions of the
changed rows applied in memory. This avoids full-batch entity materialization;
it does **not** promise constant database scan work for aggregate counts.
Rows, file statistics and audit entries still commit in one SaveChanges
transaction. Optimistic concurrency on the tracked import file rejects a writer
if another command committed after its original file read. Timestamp updates
advance even with a fixed/coarse or backward-moving clock, so repeated versions
cannot silently undermine that guard. Existing duplicate acknowledgment,
permission checks, category restrictions, completion and uniqueness rules remain.

GET projections and existing full-batch operations are unchanged. The richer
response is prepared before SaveChanges and returned only after it succeeds;
formatting cannot turn a committed write into an apparent pre-save failure.
Non-object legacy raw label JSON now falls back to no imported labels.

## Backward-compatible HTTP contract

These existing routes optionally accept `returnChanges=true`:

- `PUT /imports/{id}/drafts/{rowId}`
- `PUT /imports/{id}/drafts`
- `POST /imports/{id}/drafts/{rowId}/decision`
- `DELETE /imports/{id}/drafts/{rowId}`

The household API prefix is unchanged. With the option, successful requests return
200 and `{ summary, items, removedDraftIds, savedRows }`. Only changed rows appear
in items; deletion returns its ID, no replacement page. Summary includes exact
whole-batch counts and the new file UpdatedAtUtc. Response size is proportional
to changed rows, not the full import. A 10,000-row bulk correction still involves
10,000 changed rows; it is not capped to the visible page.

Without the option, the previous single-row 204 and bulk `{ savedRows }` response
shapes are preserved. Existing clients continue working, but still perform their
old full-detail refreshes until outcome 3 connects the smaller responses.

Callers can also send `expectedImportUpdatedAtUtc`, using the exact timestamp
string from the last accepted summary (URL-encode it without converting through
a lower-precision JavaScript Date). It is compared **after** authorization and
reviewability checks, before row loading. A stale expected version returns 409
without saving anything. A concurrent EF save conflict also returns a safe 409.
The expected version is optional for compatibility, not an authorization token;
visibility and Owner/Editor/Viewer/personal-owner checks still apply independently.

Clients must preserve edits after errors, refresh/reconcile before a deliberate
retry, and never automatically replay a financial command. A lost response may
mean the prior write committed; the old expected timestamp will then reject a
blind replay. Summary/page reads remain ordinary reads, not transactional snapshots
or a guarantee that nothing changed after the response.

## Verification

Automated coverage includes:

- Real in-process HTTP writes against synthetic 100/1,000/10,000-row SQLite
  imports: correction, approval, stale-version rejection and deletion. Existing
  untouched rows retain their original values/timestamps; no official transaction
  is created by a staged correction/decision/removal.
- One-row response sizes of 1,063 / 1,070 / 1,076 uncompressed JSON bytes for those
  three batch sizes, respectively; no machine-specific timing gates.
- Bulk subsets spanning pages, invalid values, missing IDs and all-or-nothing
  writes, with exact global summaries and persisted file counts.
- SQL Server query translation/parameter chunking without a live SQL Server
  connection; real SQLite tracking verifies only affected drafts are tracked.
- Failed/canceled writes roll back row, file statistics and audit; explicit retry
  succeeds once. A competing different-row writer wins, and the stale writer's
  changes/audit roll back rather than lose global counters.
- Existing import privacy, Viewer/personal-owner, duplicate acknowledgment,
  category, atomic-completion, idempotency and uniqueness regression tests.

All fixtures use disposable data and recording-only email. Permanent manual QA
cases are recorded but the owner's full #197 sweep remains deferred. This is not
a claim of manual browser verification or real SQL Server performance testing.

Final verification (2026-10-14): 671 backend tests and 615 frontend tests passed;
client lint/build passed. The affected import subset passed all 226 tests. Raw
test evidence is generated under ignored `artifacts/import-draft-read-qa`.

## Remaining for #212

The [third outcome](import-review-paging.md) now connects the review screen to these
contracts, preserves dirty edits/explicit clearing and existing read/history
ownership, provides read-only server-wide budget-choice previews, and reduces
redundant list/page/rule reads. Label parsing remains bounded for compatibility;
rule preview uses a minimal projection without RawData. Focused manual sign-off
is still needed before merge; the full owner #197 sweep remains deferred.
