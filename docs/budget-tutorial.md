# Build your first budget (#260): quick monthly slice

Tutorials → Guided financial task → Build your first budget opens the **real
Monthly budget page**. No abstract example page or new financial workflow is
introduced. The annual-target path is deliberately deferred to the second slice
of #260, as the issue specifies; the catalog description says so.

## Guided steps

1. Choose month, year and Household/Personal scope, then Use this month.
2. If absent, deliberately Create blank budget. If Draft/Active already exists,
   use it without creating another. Closed is not automatically reopened.
3. Start with one category total (Overall), or keep an existing Detailed setup.
4. Inspect a category with subcategories. Detailed amounts add up to its total;
   do not add an Overall amount on top. Choosing a new mode is optional and the
   normal clearing confirmation remains. With no subcategories, explain the
   limitation instead of creating any.
5. Check another actual category and its monthly amount.
6. Check one more category. Both steps identify the category beside its input,
   allow keeping or leaving it blank, and handle fewer categories honestly.
7. Review the monthly total and explicitly Save budget if dirty. Unchanged saved
   amounts can continue without a redundant write.
8. Explain Draft versus Active before offering the decision: Draft is saved but
   still being planned, Active is the chosen plan for the month. Both show actual
   spending and remain editable; Active is protected from annual allocation's
   explicit Draft replacement option. Activation does not create transactions.
9. Optionally press the page's Activate, then verify Active; or choose Keep as
   draft in the coach. That coach choice performs no financial write.
10. Check the month, scope, currency and confirmed saved status. Continue budgeting
    completes the guide and leaves the same budget open for further editing,
    without reloading or another budget write. Return to tutorials completes the
    guide and opens the tutorial list instead.

Existing saved plans need no artificial change. At least one saved planned amount
is needed to finish; zero counts, blank means no plan. Visiting the extra category
steps never forces spending allocations or a mode change merely to advance.

Main prompts are short; consequences and extra explanation stay under collapsed
More details. Monthly planning is independent of annual targets. Actuals are
recorded spending, not editable planned amounts. Mode switching retains the
existing confirmation that clearing the other mode's entered amounts requires.

## Ownership and recovery

The page remains the sole owner of create/save/status commands, permissions,
validation and unsaved-change guards. Tutorial navigation writes progress
metadata only. A read-only scalar projection reports period/scope, budget ID,
status, permissions, freshness, dirty/busy/uncertain, amount-presence, category
availability and mode booleans.
It never publishes amounts or category names to tutorial state. Progress contains
only the existing key/version/status/step metadata, not the selected budget.

After Use this month, household, role, period, scope and any existing budget ID
are bound in memory. After creation the resulting ID is bound too. Changing
context blocks advancement until explicit reselection; it never silently
retargets or repeats a write. Late create/save/status responses cannot overwrite
the currently selected household/period. Viewers cannot edit monthly plans under
the app's current permissions, including Personal scope. Missing categories and
failed/stale reads give guidance rather than treating a failed load as absence.

During this guided task, an uncertain write response locks subsequent financial
changes until a fresh successful read. Check saved budget is a read, not a retry.
It uses the normal unsaved-input discard confirmation before reloading. A server
validation rejection can be corrected normally. Success and optional activation
are confirmed from authoritative returned/read state, not a button click.

Exit/Escape removes the coach immediately, leaves saved work intact and does not
cancel/replay requests or clear unsaved amounts. Normal leaving/selection guards
still apply. Within-page Next/Back does not navigate or prompt to discard edits.
An unfinished tour says Start again, not Resume: progress deliberately does not
retain financial context. Replay starts with explicit selection and fresh reads.
Both completion choices require clean saved amounts and the chosen Draft/Active
outcome. Exit/Escape remains an unfinished exit rather than completion.

## Presentation and verification

The import companion's dark coach, gold ring, visual dimming, error handling,
keyboard/focus recovery and bounded target wait are reused. Real forms/dialogs
remain operable. Required outcomes cannot be skipped. The first editable amount
is the planning spotlight, so a tall category history panel does not hide the
input on mobile. The save step targets the Save button with the live monthly
total beside it, not a tall action bar that could put its last button under the
coach. During the guide only, the real save bar is in normal page flow
inside the existing PageFrame lane, with scroll space below it; outside the guide
its fixed behavior is unchanged. This prevents two fixed bars covering Save and
Activate on a narrow screen.

- `budgetTutorialState.test.ts`: authority/context/outcome gates and concise steps.
- `BudgetTutorialFlow.test.tsx`: real page flows with synthetic API responses,
  no tutorial-issued financial commands, Overall/Detailed cancellation, zero,
  blank, existing states, dirty exit, scope/role changes, late household writes,
  and lost create/save/activation responses with no duplicate commands.
- Tutorial-progress integration coverage includes `build-first-budget`, last step 9.
- `node tools/LayoutQa/verify-budget-tutorial.mjs` uses intercepted synthetic API
  responses only at 1440/390/320px: new, Draft, Active, Closed, Viewer, failed
  read, lost create/save/activation. All writes are counted and unexpected writes
  blocked. No application server, production DB or real email is used. Optional
  `BUDGETAPP_QA_PLAYWRIGHT_PATH` and `BUDGETAPP_QA_BROWSER_PATH` match the other
  LayoutQa scripts. Ignored artifacts go to `artifacts/budget-tutorial-qa`.
- Permanent human cases are in the manual QA plan. Actual assistive-technology
  and real 200% zoom checks remain human sign-off, not synthetic passes.

Initial six-step verification on the #260 branch: 754 frontend tests and 708 backend
tests passed; client build and lint succeeded (existing lint warnings remain).
After the final Save spotlight adjustment, all 170 affected tests passed again.
All 27 budget browser cases passed at 1440×900, 390×844 and 320×740, including
an explicit Save-button/coach non-overlap assertion. All 24 existing import
tutorial browser cases passed. Human manual QA is pending; the annual branch
has not been implemented or claimed complete, and nothing is merged by this work.

Expanded ten-step verification: all 758 frontend tests and 708 backend tests
passed. Client build and lint succeeded with existing warnings. All 27 budget
browser cases and 24 import-tutorial regression cases passed again, including
the multi-category breakdown, Draft/Active explanation and 320px layout after
Exit/replay. The narrow-screen category metrics now use shrinkable columns so
Detailed rows cannot force the category cards wider than the page. Human manual
QA remains pending; these checks use synthetic/disposable responses only.

Completion-choice follow-up: 760 frontend tests, client build, lint (existing
warnings) and all 27 budget browser cases passed. Draft and Active completion
are tested for both destinations. Continue budgeting retains editable page state
without another read/write; browser checks cover it at all three widths.

Fixed-bar spacing follow-up: entering/leaving the tutorial replaces the action-bar
DOM element because its guided layout is in normal flow. The height observer now
rebinds when tutorial mode changes, and only fixed mode reserves the measured
height. This keeps the final warning and removal/replacement help scrollable above
the bar after Continue budgeting or Exit/Escape, including replay. The regression
test failed before the fix; existing height/wrapping and no-budget cleanup tests
remain in place.
Verification: 761 frontend tests, client build and lint (existing warnings)
passed. All 27 synthetic budget browser cases passed, now checking collapsed and
expanded bottom-help clearance after completion/exit at 1440/390/320px.
