# Contextual help (#154)

## User-facing pattern

Short **About …** disclosures appear near scope/privacy, budget-state,
annual-target, import, and removal/replacement controls. Native `details/summary`
supports touch, Enter/Space, and screen-reader disclosure state without a tooltip,
modal, focus trap, or hover requirement. Escape closes an open disclosure and
returns focus to its summary. Tab remains normal page navigation.

**Read more: [topic]** opens a read-only article in **Settings → Help**. The five
stable topic URLs are `/help#scope-privacy`, `/help#budget-states`,
`/help#annual-targets`, `/help#import-approval`, and `/help#destructive-actions`.
The topic navigation updates its heading/current-topic state and deliberately
focuses the heading. Back/Forward and direct/reloaded links retain the topic.
The shared focus scroll offset accounts for the sticky household context header
as well as a narrow sidebar header so the destination heading is not covered.
Unknown hashes give a safe browse fallback; URL text is never interpreted as HTML.

The Help page uses the shared shell, title, Skip, and route announcement behavior.
It can be read anonymously, without a household, or before email verification.
That static-page exception does not unlock financial endpoints. Household load
failure does not block reading help. Tutorials remain a separate replayable,
guided experience; no new walkthroughs or tutorial progress writes are added.

## Content and safety

`src/help/helpTopics.ts` owns the topic IDs, concise summaries, articles, and key
warning strings. Inline help and deeper articles use the same vocabulary:

- Financial account scope controls account access; transaction budget inclusion
  controls actuals. Personal + Household counts the full amount in each without
  splitting or duplicate ledger records. Overlapping reports must not be summed.
- Draft/Active/Closed describe planned-amount edit/replacement rules, not a frozen
  ledger. Closed-month actuals can change after transaction corrections.
- Annual targets create independent selected monthly Drafts; household defaults,
  saved fiscal plans, monthly budgets, and calendar-year reports stay distinct.
- Upload, review, approval, and **Create approved transactions** are separate
  stages. Excluding a staged row is not the same as including neither budget.
- Removal, replacement, return-to-Draft, and deactivation are different actions.
  Warnings identify what is affected, what stays, and whether in-app Undo exists.

Critical sharing, Draft deletion/replacement, and import-discard consequences
remain visible outside disclosures. Existing confirmations remain in place and
now explicitly distinguish planned/staged data from ledger transactions.
The monthly removal explanation is in normal page flow, not an expandable panel
inside the fixed Save bar. Permissions, financial calculations, and write APIs
are unchanged. No database migration or deployment configuration is required.

Opening/closing a disclosure never submits a form, writes data, stores progress,
or clears an edit guard. Deeper links use the shared guarded router; canceling
navigation preserves entered values. Native modified-click/new-tab behavior is
preserved. Help does not confirm destructive actions on the user's behalf.

## Extending and verifying

Add/change copy in the topic catalog first, then reuse `ContextualHelp` at the
relevant control. Keep critical action warnings visible and action-specific;
do not replace validation, permission explanations, or confirmations with help.
Verify explanatory copy against the implemented behavior when that behavior
changes. Keep stable IDs so bookmarks and page links do not break.

Automated tests cover disclosures, Escape/focus return, unchanged forms/storage,
guards, direct/unknown topic links, current-page/title/focus semantics,
Back/Forward, no-household/unverified/anonymous access, and cancellation of
Draft deletion. Existing import, tutorial, and unsaved-change regressions run too.
A read-only built-client sample preview checks desktop/narrow layout, no page
overflow, Enter opening and Escape closing. Its host rejects all writes, uses only
sample GET responses, contacts no database, and sends no email.

Actual 200% browser zoom and screen-reader speech remain manual sign-off cases in
the [living QA plan](manual-qa-regression-test-plan.md#contextual-help-regression-154).
