# Async read ownership (#214)

## Scope

This is a client-side reliability change. It does not change authorization,
financial calculations, API write contracts, email delivery or hosting. It does
not implement query/history restoration (#215), server-side draft paging (#212),
or broad import rendering optimization (#213).

## Rules for reads

- `useReadOwner(contextKey)` permits only the newest attempt in the committed
  context to apply data, errors or loading completion. Context changes and unmount
  invalidate previous attempts, including A → B → A transitions and StrictMode.
- Starting a newer read aborts the previous controller. Targeted session,
  membership, import list/detail/preview and category GETs pass the signal to
  `apiGet`. Readers that ignore cancellation are still protected by ownership.
- Cancellation is not reported as a connection failure. Writes receive no abort
  signal, automatic replay, token caching or weaker request protections.
- `captureContext()` protects follow-up work across multiple awaits. A read that
  finished successfully in A cannot later clear B's draft cache or publish A's
  action/preview messages after the user changes context.
- `usePageLoad` uses the same ownership mechanism while retaining its existing
  loading, ready, failed and stale feedback. Access-denied/not-found reads do not
  expose retained data as though it were still accessible.

## Providers and shell

Explicit session refreshes and quiet confirmation checks share read ownership.
Login, logout and explicit user updates invalidate old reads; no session read
starts while an authentication write is changing the cookie. Pending MFA results
remain unauthenticated. A failed logout retains the current user and is not
automatically repeated.

Household reads are keyed by user ID and confirmed-email eligibility, not the
whole user object. Former-user memberships are masked immediately on a context
change. Selection/storage updates require ownership, and same-user refreshes
retain a still-valid deliberate selection. Saved household updates/new memberships
cannot be overwritten by an older read. Signing out/unconfirming clears in-memory
views without deleting the saved selection or server data. Confirmed access loss
removes retained memberships; transient failures keep same-user data for retry.

The shell distinguishes unknown initial data from retained same-context data.
Initial failures block with a retry rather than redirecting to household creation.
`ProviderReadBoundary` keeps the editor DOM mounted during a same-context provider
refresh/failure, with an accessible status/retry outside an inert retained region.
Financial controls cannot be used from that retained region until retry succeeds.
User/household changes still use the existing identity boundary; revoked access
removes financial content. Account settings remain reachable without a household.

## Import review

Existing list/detail/category failed/empty feedback is preserved. A stale empty
list no longer claims “No imports yet.” Rule-preview failures have their own
read-only retry; unknown/stale match counts cannot enable rule application.

Manual selected refresh retains the row cache on failure and prevents new row
edits until its full refresh chain finishes. Changing the selected context does
not let an older chain clear the new context's cache. Save failures retain edits.
A successful save/completion followed by a failed read is explicitly still a
successful write; retry reloads data only, never replays the command.

## Verification

Deferred-response characterization reproduced seven failures before the fixes:
three session races, three membership races, and an A refresh clearing B's edits.
Coverage also checks cancellation ignored by readers, A/B/A, unmount/StrictMode,
initial versus retained failures, successful zero-record results, shell/editor
retention, revoked access, and successful saves/completion with failed reads.

The fictional read-only browser harness is
`tools/LayoutQa/verify-read-ownership.mjs`. It covers initial list failure, stale
empty results, rule-preview retry and late detail/list responses at desktop and
narrow widths. It blocks all API writes and external requests and uses no real
database, email, or browser profile. Artifacts go to ignored
`artifacts/read-ownership-qa`.

Verification on October 9, 2026: 584 frontend tests, 628 backend tests, client lint
and production build pass. All ten desktop/narrow browser cases pass with no
API writes or external requests. This is a race/recovery correction, not a
production latency benchmark.

The owner's wider manual sweep remains deferred. Permanent targeted cases are in
[the manual QA plan](manual-qa-regression-test-plan.md); automated tests are not
recorded as completion of those manual checks.
