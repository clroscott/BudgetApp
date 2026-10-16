# Import and review tutorial (#253)

## Available workflow

Tutorials -> Guided financial task -> Import and review transactions. Start,
Start again and Replay all begin with explicit task selection: a new CSV/Excel upload
or an existing import. This replaces the old CSV-only Coming soon card; existing
Getting started and other planned cards remain available/unchanged.

The ten checkpoints are: task choice; account confirmation; file choice;
preview/mapping/staging; import confirmation; corrections; budget inclusion;
duplicate/review decisions; explicit transaction creation; completion verification.
An existing Completed import goes directly from selection to verification. A
Reversed/Failed/Processing import is not reopened or reported as newly completed.
Excluded-only completion is valid and may create zero transactions.

This is a real-data task companion, not an example-data generator. It never
selects a local file, saves configuration, stages/approves/discards/undoes an import
or creates a transaction itself. The normal page owns those actions, including
its existing permissions, validation, confirmations and unsaved-change guards.
The guide explains consequences before each relevant task checkpoint. Correct
rows need no artificial edit; approved decisions need no repeated approval.

After a successful upload, the normal **Review this import** page link uses the
same outcome-checked, guarded navigation as **Review staged import** in the coach.
Either action moves guidance to import confirmation with the exact staged ID.
Canceled navigation stays at the upload step without a second prompt; modifier/
new-tab clicks do not advance the original tab. No upload/approval/creation is
repeated by this handoff. Outside that active checkpoint, normal link behavior
is unchanged.

The main review workflow promotes bulk budget choices into the full-width
**1. Prepare rows** area, under **Set budgets for multiple rows**. The existing
row filter sits above the workflow so the matching scope is visible. The budget
tutorial checkpoint highlights choices, current-page/all-matching scope, Apply
and Save all corrections together. Applying remains a confirmed local staging
change; saving is a separate explicit action. Dirty changes block Next, but users
may keep the existing choices without making an artificial bulk edit. Individual
row checkboxes, privacy/permission skips and cross-page behavior are unchanged.

## Compact spotlight guidance

A fixed dark-green coach shows one short action prompt at a time. The rest of
the page is dimmed, with a gold spotlight around the current task. Detailed
explanations and Restart stay under a closed-by-default More details disclosure.
The action buttons remain outcome-gated; the presentation does not infer success
from clicking a financial control.

The coach is docked at the bottom with bounded height, internal scrolling and
extra scroll space at the end of the task page. Each step scrolls to its target;
Show me scrolls/focuses it again. The ring follows the control's viewport bounds
through page/nested-grid scrolling, without cropping it at the coach's height.
Account, file, worksheet, mapping, upload, row grid, budget choices, approval and
creation use specific targets. Ordered target alternatives follow the visible
worksheet/mapping/staging state without clicking controls. A Completed result changes
the target to completion verification instead of waiting for a removed button.

This is still a modeless real-data task: dimming is visual, not a pointer blocker
or inert/focus trap. Normal filters, paging, Details, corrections, errors and
confirmation dialogs remain usable, including portals outside the spotlight.
A rendered offscreen control is not a missing target. The existing Getting
started Learn-only spotlight/inert policy remains unchanged.

Exit/Escape dismiss promptly without waiting for progress persistence and never
revert work or cancel/retry a financial request. Finish returns to Tutorials
through the guarded router. Focus returns to a surviving launch control or page
heading. Navigating elsewhere exposes Return to task page; hidden/missing
targets retain bounded Retry/Exit feedback and cannot unlock a required outcome.
No tutorial editor or new task-writing API is introduced.

### Errors during a task

Import upload/review action errors opt into a persistent floating ErrorSummary
notice at the top of the viewport, above the guide layer, with the actual message.
It is non-modal, keyboard-focused when newly shown, never auto-dismissed, and
never executes a retry. Dismiss returns the error to its inline location; a new
failure shows a new notice. Other pages keep their existing error presentation.

Existing visible page alerts (including read failures and row validation) pause
the guide at its current step. The dimming lifts so feedback and corrective
controls remain readable; the coach says Needs attention and offers Show error.
Next is unavailable while a page alert remains. Clearing the error restores the
normal guide at the same step, not a fabricated successful outcome. Exit/Back
remain available. A repeated-file rejection still requires the user's deliberate
checkbox choice and a separate upload click; a lost response requires saved-status
reconciliation, not a tutorial retry. Alert text is never saved in progress.

## Outcome and context ownership

The existing tutorial definition has an `outcome` advancement type, rather than
using button clicks to infer success. Import pages publish a small typed scalar
observation through `useImportTutorialPage`: household/account/import identities,
loaded/fresh/busy/dirty flags, file type, saved status and summary counts. The
tutorial receives no File objects, row values, descriptions, tokens or API commands.
These are UI readiness observations, not a replacement for server authorization.

The guide binds the explicitly confirmed account and the successfully staged or
explicitly confirmed import. Changing the selected account requires confirmation
again; a different selected import does not silently become the bound target.
Household changes invalidate the task until explicit restart. Page registrations
are owner-scoped, so late cleanup cannot clear a newer page; existing request
revision/context ownership rejects stale server results.

Next only changes navigation/tutorial progress. It waits for permitted loaded
account/file input, successful staging, fresh selected-import data, saved clean
corrections, all review decisions, and finally fresh Completed status as relevant.
Failed, dirty, pending, stale or uncertain states cannot stand in for success.
After an uncertain command, use the normal page's saved-status refresh. Neither
Next, Retry target, Restart nor Replay resends the command. Completed status may
have been saved earlier/by another permitted session; the guide reports that
observed state, not a claim that the tutorial itself created transactions.

## Resume and persistence

The existing tutorial-progress API stores only key, version, status and step
index with timestamps. No migration or new financial endpoint is needed. Version 1
uses key `import-review`. Its definition declares restart behavior, so the library
offers **Start again**, not a misleading Resume action. It returns to task
selection and fresh reads because progress deliberately contains
no household/import binding or local file. Users reselect an existing batch or a
new task; a local file must be chosen manually. This is safer than silently
restoring a financial target from an old index. Progress metadata is not proof of
financial completion or a reservation/authorization for a write.

The existing Getting started tour still resumes its saved step and also offers
Start again to explicitly reset the guide to step one. Neither restart option
discards saved application data.

Progress saves retain the existing serialization, failure feedback and sign-in
session ownership. Their failure does not prevent page work, advancing a verified
step or exiting. No shared-user cache, background financial read loop, automatic
financial retry, arbitrary script or authoring UI is introduced.

## Verification

- Component/integration tests exercise the real import pages with synthetic API
  responses: CSV, Excel multi-sheet preview, mapping permission/save paths,
  Viewer account selection, failed/uncertain staging, pending operations, changed
  household/late response, offscreen targets, resume/completed verification and
  replay without duplicate financial writes. Pure gate tests cover missing/stale/
  dirty/unauthorized/mismatched contexts and decision/completion requirements.
- Existing Getting started recovery, keyboard, inert, Exit, progress-ordering and
  guarded-navigation tests remain regression gates. The existing backend progress
  lifecycle test also exercises the new key and final checkpoint.
- `tools/LayoutQa/verify-import-tutorial.mjs` renders the real client at
  1440/390/320px with every API request intercepted. It covers CSV, Excel, custom
  mapping, existing Completed, denied Viewer, failed upload and lost-completion
  response. Any unexpected write/external request fails closed. These are UI tests,
  not XLSX parser tests or real database/email operations.
- Permanent human keyboard/screen-reader, real zoom/device, full mapping/privacy
  and workflow cases remain unchecked in the manual QA plan until performed.
