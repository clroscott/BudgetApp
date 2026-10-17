# Tutorial workflows and safety

## Annual Overview (#263)

The guide uses the existing Annual Overview and Transactions pages. Seven short
steps cover year/scope, totals, a month, categories, the real spending drill-down,
its active filters, and return to the same report. It never creates examples,
budgets or transactions. Empty data and Viewers are supported.

The existing spotlight/focus/recovery implementation remains authoritative.
`read-companion` uses its compact dock but retains strict learn-only isolation:
each usable read control has an explicit developer-authored stable ID listed in
that step. A container ID never enables all its children. Form submissions are
also denied unless that specific read form is named. Existing Getting started
behavior is unchanged. Financial write controls and preset saves remain inert.

A read-only page projection provides household, route and readiness—not amounts
or row contents. Household/role is bound at the first chosen-context step. Stale,
failed or pending reads cannot certify an outcome. Selected route/filter URLs
are kept in memory for the drill-down return, never in tutorial progress. Restart
clears them. A navigation click that removes its own source link advances only
after the URL confirms navigation, with a token canceling Exit/replay/step changes.

Completion offers Continue reviewing (keep the same report) or Return to
tutorials. Both record metadata only. Exit stays unfinished. Missing targets keep
the existing bounded Retry/Exit behavior. No new database migration or tutorial
editor is introduced.

Automated coverage: `ReadTutorialFlow.test.tsx`, the focused allowlist test in
`TutorialOverlay.test.tsx`, and existing report drill-down regression tests.
`tools/LayoutQa/verify-planned-tutorials.mjs` intercepts every API, blocks unexpected
writes/external requests and uses synthetic normal/empty-Viewer/failed-read cases
at 1440/390/320px. Artifacts are ignored under `artifacts/read-tutorial-qa`.
Human screen-reader/zoom and real-user acceptance remain pending.

## Change history (#268)

Five short steps use the existing history page: visibility, explicit date/person/
action/type read filters, details or honest empty state, pagination, and history
versus Undo. No audit entry or financial/configuration command is created by the
guide. Continue reviewing preserves the current filters. The page now uses the
existing read-ownership helper so old household/filter responses cannot certify
new context, and unavailable history is not rendered as a successful empty list.

## Export (#269)

Five short steps explain safe filters, applied-filter boundaries, matching totals
and currencies, an optional deliberate download, and an honest ending that does
not claim the browser saved a file. Draft filter edits block advancement until
applied. Unsaved transaction edits require a normal explicit resolution, not an
automatic discard. Save preset and transaction edits stay inert.

The normal export helper creates a marked short-lived same-origin blob download
link following the user's export click. Only that exact marked blob link is
allowlisted during the optional download step; arbitrary external links remain
blocked. No download is requested by Start/Next/Back/Replay. Pending requests pause
the guide; failures expose the existing error plus an explicit read-only Retry
search, never an automatic retry of the download. Export permissions, filtering,
redaction and format are unchanged. Normal unfiltered exports can include ordinary
excluded/voided records; active budget-inclusion filters change that, while undone
imports remain omitted. The guide points to the actual active filter rules.

## Dashboard customization (#267)

Six compact guided steps use the real dashboard editor: open, choose cards,
reorder, desktop columns, explicit Save/Cancel, and completion. Existing choices
are valid; no forced write or reset is required. Viewers can customize their own
user/household layout. A scalar observation binds household/role and blocks stale,
pending, dirty or uncertain outcomes. A lost save response exposes Check saved
layout; it reads the saved preference before another Save or Reset is permitted.
No tutorial navigation writes a preference. Nine browser cases cover desktop and
mobile, empty Viewer layout, failed reads and lost save response reconciliation.

## Recurring expectations (#261)

The real Recurring expenses page offers explicit new/existing task selection.
Short steps cover amount/scope, category placement, dates/optional account and
expected day, then an explicit normal-page save. An unchanged existing item can
be canceled and retained without a write. The guide never posts a transaction.
The optional monthly handoff binds scope and selected period, waits for a fresh
read, and permits only the user's normal Build from recurring expenses action.
An existing budget can be retained; the tutorial never replaces or activates it.

Read ownership rejects late context responses. A confirmed save clears its form
even if the subsequent list refresh fails; this avoids offering the same Add a
second time. An unknown save result locks writes, offers a read-only list check,
and requires deliberate existing-item selection after restart rather than guessing
identity from a name/amount. Normal dirty guards and explicit discard prompts
remain. Tutorial progress holds no expense names, amounts or record IDs.

Coverage: RecurringTutorialFlow.test.tsx plus dirty-form regressions and
tools/LayoutQa/verify-recurring-tutorial.mjs (12 desktop/mobile intercepted cases).
The browser harness permits only its deliberately requested synthetic expectation
and monthly-draft commands; all other writes and external requests are blocked.

## Why totals do not match (#264)

Ten short read-only steps investigate a chosen Annual Overview spending report:
context, saved/missing/zero plans, its actual transaction drill-down, applied
filters, inclusion/signs/currencies, matching totals, unfinished/undone imports,
visible change history, and a deliberately non-diagnostic conclusion. It does
not claim to reconcile bank balances or infer a cause from absence of evidence.
Safe import-list controls are individually allowlisted; approval, correction,
completion, reversal and row removal stay inert. Failed metadata reads cannot be
called an empty import list, and pre-existing dirty import edits block progress.
Only progress metadata is written. Any correction/import guide is a separately
chosen next task, not an automatic handoff.

Owner/Viewer component tests and nine intercepted desktop/mobile browser cases
cover the real report/Transactions/Import review/Change history pages, including
empty results and initial/import-list read failures. They verify the original
report year/scope is restored and no financial/configuration command is issued.

## Reusable import profiles (#257)

Seven guided steps use the existing shared mapping editor and import profile
selector. Owners/Admins can choose a new/existing profile; Viewers inspect saved
mapping details without an edit form and can select a permitted active profile
for CSV or Excel. Explicit saves only, with an unchanged Cancel path and no forced
duplicate profile. The optional template download is a user action, not a tour
request. Account names are shown only when the normal visible account read
contains them; an inaccessible preferred account is not resolved or exposed.

The page uses read ownership and guards stale/failed reads. A known saved response
clears the editor before refreshing. Unknown results lock writes, offer Check
saved profiles, and require deliberate selection of the saved profile after a
restart. Save and Cancel are adjacent in the highlighted action group. The final
import-page step requires selecting that saved profile but requires no file.
An optional explicit Start import tutorial ends this run and starts the separate
import guide; revision checks cancel a delayed handoff after Exit/replay.

ProfileTutorialFlow.test.tsx covers new/existing/Viewer, debit-credit layouts,
localized parsing, dirty Exit, lost replies and a separate import handoff.
verify-profile-tutorial.mjs covers twelve intercepted desktop/mobile cases,
including an optional synthetic template download. No file is inspected, uploaded
or completed and no real messages/database are involved.

## Finance setup (#265)

The user chooses Accounts, Categories, or Both. Account selection is explicit:
use a permitted active existing record or create a needed one through the normal
form. Name/type/currency/scope are explained before saving. Viewers retain their
own Personal-account actions but cannot edit shared Household accounts/categories.
Category setup is optional shared organization: keep useful existing records or
deliberately add/rename only what is needed. Empty Viewer setup ends honestly as
reviewed, not falsely complete. No automatic seeding, restructuring or handoff.

Both pages use owned reads. Confirmed writes clear their forms before the refresh;
unknown results lock writes and require a successful saved-list check. Account
recovery selects the actual saved identity; category recovery explicitly accepts
the checked list and discards unsaved form details only after normal confirmation.
No create is repeated automatically. Back restores the selected saved account
across chapters without making a new one. Dirty Exit and existing guards remain.

SetupTutorialFlow.test.tsx plus existing native-form guard tests cover the flow.
verify-setup-tutorial.mjs covers 18 intercepted browser cases at 1440/390/320px.
Long forms can be scrolled above the fixed coach using normal page scrolling;
browser QA uses native hit testing rather than forced clicks through the coach.

All new page projections publish scalar observations only while their related
guide is active. They are idle during normal app use; no extra normal-page API
request is introduced. The existing monthly observer also supports the explicit
recurring-budget handoff. Progress remains metadata-only.

## Household invitations (#266)

The real Household page offers an explicit new invitation, existing invitation,
existing member, or permitted read-only review. Six compact steps cover existing
access, roles/privacy, recipient/role, an explicit real Send, actual status, and
separate recipient acceptance. Owner/Admin limits and existing last-owner/leave/
delete safeguards are unchanged. Viewers have no inaccessible required send.

Confirmed saves clear the native form before the owned list refresh; known
failure to deliver email is not called success or acceptance. A saved Pending
record does not prove inbox delivery. Unknown send/resend/revoke results lock
management writes, require a post-error saved-list read, and recover through
explicit saved-record selection rather than another message. Resend/Revoke
remain separate normal page actions and are never invoked by tour navigation.
Completion ends the review, not an assertion that the recipient accepted or that
an undelivered email arrived. Emails/tokens/message content are absent from
progress and page observations; only scalar IDs/status flags are held in memory.

InvitationTutorialFlow.test.tsx covers status/permission/delivery/dirty/context
cases and a deliberate optional resend. verify-invitation-tutorial.mjs verifies
27 intercepted browser cases at 1440/390/320px with fake recipients/delivery,
blocking every unexpected management write or external request. No real SMTP,
email or database is used.
## Transaction correction (#259)

`search-edit-transactions` is an eight-step real-page financial task. It binds a
chosen permitted row, household, role and applied search URL in memory. Search
and currency totals precede explicit selection; empty/read-only/already-correct
results can finish without mutation. The user owns the ordinary row Save/Cancel
and each separate budget-inclusion Save. The tutorial never invents Save all.
All open inclusion editors participate in dirty/busy/uncertain observations.
Confirmed saves and explicit saved-state reloads have per-ID monotonic evidence,
so an earlier save or another record cannot certify this run. Failed refreshes
pause, filtered-out saved records are explained honestly, and lost replies lock
repeat writes until an explicit owned read. Exit does not remove that safety
lock or discard drafts. Final navigation restores the selected filtered search.
Only normal existing APIs write; progress contains metadata only. Browser QA
uses intercepted synthetic records at 1440/390/320px, not production data.

## Category correction and mistaken-import recovery

`categorize-transactions` (#258) binds an actual permitted saved row or staged
batch. Correct categories can stay unchanged. Existing rules are preferred over
new duplicates; any rule save or staged application belongs to normal controls.
The guide explains parent-to-child Fill and explicit Reapply replacement, never
promises retroactive posted edits, and waits for fresh saved rules/match counts.
Rule-page reads are now owned by household/role; uncertain writes require a new
successful read and explicit saved-rule selection, not a guessed create retry.

`fix-mistaken-import` (#255) binds the exact file/role in memory. Its distinct
paths are staged correction, permanent staged discard, existing whole-batch Undo
preview, or review unchanged. A discard requires the known reply plus a fresh
list; lack of a file alone is not proof. Undo eligibility and commands remain in
the existing preview component. Blocked/unchanged/already-undone are valid honest
outcomes. Lost replies use that preview's read reconciliation, never automatic
reversal, partial deletion, override, re-upload, or fallback removal. Optional new
import handoff completes metadata first and starts a fresh explicit selection.

## Import troubleshooting (#256)

`resolve-import-problems` separates upload/layout and already-staged row issues,
with an honest no-current-problem finish. Account and opaque file revision bind
the upload context in memory; exact saved ID binds subsequent review. Real page
links use the same guarded confirmed-staging handoff as the coach. CSV/Excel
inspection and every upload/profile/save/review action remain user initiated.
Repeated-file 409 rejection is known, not a lost write reply. Its allowance stays
off until explicitly checked. Unknown upload/profile replies lock repeated writes
and offer saved imports/profiles for inspection, without matching by filename or
inventing success. Expected row validation remains visible as the tutorial task;
other request errors still pause progression. Invalid rows require a real saved
correction or Exit. Possible duplicates can remain Pending; explicit Approve on a
marked row uses the existing acknowledgment semantics, not a tutorial action.

## Budget state and annual-target guides (#262/#260)

`budget-lifecycle` offers Copy, Reopen, or Return to Draft as separate choices.
The actual saved month/scope/status is checked before and after a normal page
command. Existing copy destinations are inspected, not overwritten; already
editable or Draft plans need no redundant action. Keeping the checked state is
valid. Only Return to Draft offers optional annual-target replacement, bound to
the original Draft month and scope. The user explicitly selects that month,
enables replacement and accepts the ordinary confirmation. Active/Closed months
stay protected. A newer known allocation reply is required to claim replacement;
an uncertain reply locks writes for explicit saved-state inspection, not retry.
Back cannot repeat a verified allocation. Exit never undoes saved changes.

`budget-from-annual-targets` is the alternate launch on Build your first budget;
Quick monthly keeps its existing key/version. It checks fiscal starting year,
start month and scope, Overall versus Detailed, blank versus explicit zero, saved
targets, selected-month impacts, and the resulting independent monthly plan.
Saving annual targets does not update existing monthly budgets or transactions.
Draft replacement stays off for this guide. The user may finish with annual
targets alone, inspect an existing month, or explicitly create missing Drafts.
The actual page month link and coach share guarded navigation; cancelling a
normal dirty warning does not advance the tutorial. Monthly Save and optional
activation use the usual page buttons. Closed plans can stay read-only. Neither
activation nor any tutorial action creates transactions.

Both retain only in-memory selection/evidence, enforce household/role/freshness,
preserve ordinary dirty guards, and store progress metadata only. Replay starts
with a fresh explicit choice, never a repeated write. Short final prompts offer
Continue in the workspace or Return to tutorials. The coach's own scroll resets
between chapters without resetting the user's page scroll.

