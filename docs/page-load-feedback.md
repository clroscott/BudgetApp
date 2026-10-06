# Loading, empty results, failures, and retained data

Annual overview, Annual targets, Monthly budget, and Household management use
the same read-feedback pattern. This is a reliability change, not a redesign or
change to financial calculations.

## States

- Initial loading: show a status announcement while the requested data is unknown.
- Successful load: show returned data. A successful response with no records is
  the only basis for a current empty-state message or creation options.
- Refreshing: keep the same-context data visible and identify it as previously
  loaded. Editing and write actions wait for the refresh to finish.
- Failed initial/context load: stop loading, explain that data is unavailable
  (not absent), and offer a keyboard-accessible **Retry loading** button.
- Failed refresh: label retained data as potentially out of date and read-only,
  with **Retry loading**. Retained empty responses are described as historical,
  not confirmation that nothing exists now.

**Refresh data** and **Retry loading** perform reads only. No write is retried
automatically. Errors from saves are separate from read-state feedback.

## Safety rules

The load state is keyed to household and, where relevant, year/month/scope.
Switching context hides previous-context data immediately. Older requests and
responses arriving after unmount cannot replace the current selection. Access
denied, unauthenticated, or not-found responses hide retained records instead of
presenting them as a stale authorized view.

Budget/target reloads use existing unsaved-change guards before replacing entered
amounts or fiscal defaults. Failed saves leave entered values and dirty state
intact. Household read refreshes do not replace invitation email/role fields;
those native controls remain mounted during a same-household refresh.

Monthly-budget creation and copying are unavailable if budget data or source
options could not load. Annual draft creation/replacement previews are only
shown when annual targets and the existing-budget list are current; an unknown
list never becomes "Will create Draft".

A confirmed write followed by a failed refresh is distinguished from a failed
write:

- Invitation creation/resend/revoke retains its acknowledged success notice.
  Retry refreshes members/invitations; it does not send another invitation/email.
- Annual allocation retains created/replaced/skipped counts. Retry reloads the
  plan and budget list; it does not allocate again.
- Confirmed draft deletion invalidates the old budget before reloading. A failed
  reload cannot offer another delete or claim the month is currently empty.
- After a confirmed household leave/delete, membership-list refresh can be
  retried separately without repeating the exit operation.

These controls do not provide a new server-wide exactly-once write protocol.
If a connection is lost during a write and no acknowledgement arrives, the
outcome may be uncertain. Check saved state before intentionally resubmitting;
the read retry never resubmits that write for you.

## Verification and deployment

Automated browser-component tests cover initial loading/failure/retry, successful
empty results, refreshing/stale recovery, authorization loss, entered-value
protection, unknown budget lists, acknowledged-write/failed-read recovery, and
late responses. Existing navigation/household-switch tests remain in the suite.

Permanent manual failure-injection checks are in
[the QA regression checklist](manual-qa-regression-test-plan.md). Live browser
failure-path sign-off remains a manual QA step; automated tests simulate the API
outcomes without touching Development or Production data or sending emails.

No database migration or database update is required.
