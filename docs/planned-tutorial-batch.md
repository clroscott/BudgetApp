# Planned tutorials branch

The user requested sequential delivery of multiple approved #133 tutorials on
`planned-tutorials`. Each workflow is implemented and checked separately here;
no board item is closed merely because automated tests pass. Production data,
real email and the deployed package are outside development verification.

## Delivery checklist

- [x] #263 Annual Overview — Learn only: select year/scope, read totals/months/
  categories, follow a context-preserving transaction drill-down and return.
- [x] #268 Change history — Learn only: choose safe filters, inspect visible
  entries, explain privacy and that history is not Undo. Empty history is valid.
- [x] #269 Export — Learn only: apply read filters, explain exact saved-result
  boundaries and privacy, allow only a deliberate optional download.
- [x] #267 Dashboard — Guided setup: inspect existing layout, optional card/
  order/size edits, explicit save or keep unchanged; never reset automatically.
- [x] #261 Recurring expenses — Guided setup: choose scope/category, deliberate
  expectation save, explain optional monthly-draft handoff (not transactions).
- [x] #257 Profiles — Guided setup: existing/new mapping, signs/date/culture,
  explicit save and voluntary handoff to import; no staging automatically.
- [x] #265 Finances setup — Guided setup: independent account/category choices,
  existing setup is valid, explicit saves only with normal permissions.
- [x] #266 Invitations — Guided setup: existing members/pending first, choose
  recipient/role, explicit send, confirmed pending result; no automatic resend.
- [x] #259 Search/edit — Guided financial task: select actual permitted record,
  correction/save, no artificial edit required; protect dirty and uncertain edits.
- [x] #258 Categorization — Guided financial task: posted/staged choices and
  optional rule creation/application, preserving existing confirmation semantics.
- [x] #255 Mistaken import — Guided financial task: staged correction or deliberate
  eligible completed-batch reversal; no automatic Undo or transaction removal.
- [x] #256 Import problems — Guided financial task: diagnose validation/duplicates,
  intentional corrections/acknowledgments; never auto-approve or bypass a warning.
- [x] #262 Budget lifecycle — separate copy/reopen/return-replace choices; no
  forced destructive demonstration or automatic replacement.
- [x] #260 Annual-target slice — separate from the delivered Quick monthly guide.
- [x] #264 Totals diagnosis — read-only evidence and context checks, no invented
  diagnosis or automatic corrections.

Password recovery remains unapproved. The abstract Household vs Personal page
rejected by the user is not reintroduced. The user explicitly confirmed that
#254 remains deferred; it is not part of this batch.

## Shared behavior

Short prompts and real-page spotlights reuse #177/#253; no new tutorial editor or
workflow engine. Guided writes belong to the normal page controls. Context/role
changes, stale/failed reads and uncertain commands cannot claim success. Restart
never repeats writes. Exit/Escape remains available and preserves normal dirty
guards. Completion offers Continue in the current workspace or Return to tutorials.
Only progress metadata is persisted; selected records and context stay in memory.

Record tests/browser evidence with each delivered slice. Human screen-reader,
200% zoom and discretionary real-data review remain unchecked until performed.

## Verified milestones

- First four guides: 782 frontend tests and 712 backend tests passed; client build
  and lint passed (existing warnings retained). Each new guide passed nine
  intercepted browser cases at 1440/390/320px. Existing import (24 cases) and
  monthly-budget (27 cases) browser regressions also passed.
- Recurring expenses: 17 affected component/dirty-form tests passed, then all
  169 tutorial/dirty-form tests passed. Client build passed. Twelve intercepted
  browser cases cover existing/new items, Viewer, failed reads/lost save replies,
  and optional new/existing monthly budgets at 1440/390/320px. No real database,
  financial records or email were used. Full-suite reruns follow the next slice.
- Totals checklist: 65 affected checklist/import dirty-form tests and nine
  desktop/mobile browser cases passed. Full frontend suite now passes 792 tests.
  The checklist starts with a chosen Annual Overview spending report, preserves
  its drill-down context, checks visible imports/history and does not invent a
  diagnosis. It is not an automatic bank-balance reconciliation tool.
- Profiles: 27 affected profile/Excel/dirty-form tests and twelve browser cases
  passed. New/existing/Viewer, localized parsing, optional template, failed read
  and lost-create reconciliation are covered. Save/Cancel are grouped so the
  narrow phone guide can reach both. No file inspection/upload or real email.
- Finances setup: 18 intercepted desktop/mobile cases passed for existing setup,
  explicit new account/category/subcategory, Viewer, failed reads and lost account/
  category replies. Component coverage also exercises Back to just-saved records.
  Config guides require a post-uncertainty successful read before accepting saved
  selection; no old list is treated as confirmation. Backend suite passes 716.
  The full frontend run exposed a legacy-wrapper style guard; the account choice
  panel now uses its established account styling and all 26 style guards pass.
  Full frontend/browser regressions are repeated after shared observation changes.
- Invitations: 22 affected guide/dirty-form tests and 27 intercepted browser cases
  passed. Existing member, read-only Viewer, Pending/Expired/Revoked/Accepted, new
  send, failed delivery, failed read and lost-response recovery are covered.
  Only fake recipients/delivery were used. No SMTP, real message or database.
- Shared replay/Back follow-up preserves saved account/profile/expectation IDs
  across page navigation and prevents another Create/Add inside the same run.
  Related configuration/Back tests pass; the original import browser suite again
  passed all 24 cases after observations became idle outside active guides.
- Nine-guide milestone: full frontend suite passes 824 tests (71 files), client
  build and lint pass (existing warnings only), and the existing monthly-budget
  browser suite again passes all 27 cases. No schema migration is introduced.

## Transaction search milestone: #259

The real Transactions guide passes 12 component/gating cases and 21 intercepted
browser cases at 1440/390/320px. It preserves one-row saves and the separately
saved Budget inclusion controls; there is no fictitious Save all. Empty results,
Viewer/read-only access, unchanged finishes, signed four-decimal saves, filtered-
out saved records, failed refreshes and explicit lost-reply reconciliation are
covered. Page observations include other rows' dirty inclusion choices. Lookup
and row freshness are owned by household/role/query. IDs, values and filter URLs
are never stored in progress. Full regressions are repeated after this slice.

All approved content in this checklist is implemented. Human acceptance remains
separate from automated verification; no issue is closed or deployed here.

Categorization milestone: 12 workflow tests and 24 intercepted desktop/phone
browser cases pass, including optional existing/new rules, no-change finishes,
Viewer inspection, failed reads and uncertain create reconciliation. The full
frontend suite passes 848 tests. Native staged saving and cancelled/confirmed
Reapply are covered separately; the guide never auto-applies or approves.
The previous rule-page text incorrectly promised that rules never overwrite
manual/file category choices; it now distinguishes automatic matching from
explicit Reapply, whose existing replacement confirmation remains intact.

#255 passes 10 workflow tests and 27 intercepted desktop/phone browser cases.
Staged correction, explicit/cancelled discard, eligible/blocked undo, already-
undone/read-only records, failed preview and lost reply reconciliation use the
existing normal APIs and confirmations. No real imports or transactions changed.

#256 passes 12 workflow tests and 24 intercepted desktop/phone browser cases.
No-current-problem, CSV/Excel staging, repeated-file 409 warnings, row validation,
Viewer-owned import review, possible duplicates left Pending, explicit decisions,
lost upload/profile replies and the real page-link handoff are covered. Only
expected row validation is treated as the subject of this particular tutorial;
request errors still pause the coach. Invalid rows cannot be called resolved.
Unknown writes are locked for explicit saved-state inspection; the known 409
duplicate-file warning remains a deliberate repeated-file decision, not an
automatic allowance or a guessed successful upload.

## Budget lifecycle and annual-target delivery

#262 passes 12 workflow tests and 30 intercepted desktop/phone browser cases.
Copy, existing destination, reopen, already editable, return to Draft, optional
single-month replacement, kept state, failed reads and lost-allocation replies
use normal controls. Replacement is restricted to the originally selected Draft
month in this focused guide. Viewer inspection never enables a write.

#260 passes 12 workflow tests and 33 intercepted browser cases. Annual-only,
existing/new monthly plans, Closed/Active inspection, explicit zero targets,
cancelled/lost allocation, Viewer, failed reads and Personal-scope Back paths are
covered. It is a second launch on Build your first budget, not a duplicate card.
The normal Quick monthly guide retains its original key and saved progress.

Final frontend regression: 895 tests pass in 77 files. Client build and lint pass
(lint warnings remain). The final backend regression passes 723 tests, including
all 15 new progress keys. Phone endings are concise and visible at 320px, and each
chapter resets only the coach's internal scroll. All 324 intercepted browser
cases pass across 13 matrices at 1440/390/320px against the final shared overlay
and provider, including the original import and Quick monthly guides. Annual
and lifecycle endings also assert that Continue and Exit fit without coach scroll.
The monthly replay check was updated to the intentional Replay Quick monthly
label; no app change was needed for that selector failure.
Human screen-reader, actual 200% zoom and manual
real-data acceptance are still outstanding. No migration was added and no
deployment was performed.
