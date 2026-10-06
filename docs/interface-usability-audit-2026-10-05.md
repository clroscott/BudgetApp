# Interface and usability audit — 2026-10-05

Tracking issue: [#153](https://github.com/clroscott/BudgetApp/issues/153).

## Result and scope

This is a **source/workflow assessment, not a completed live usability test**.
The review found one high-priority unsaved-work risk and five medium-priority
workflow/accessibility gaps. Fix functional gaps before considering a broad
navigation redesign.

Reviewed `main` at `cb1df696d96d242d67b7617312b629073ffda22c`.
The supplied Development URL was `https://localhost:57251/login`; the audit
browser could not load it because of `ERR_CERT_AUTHORITY_INVALID`. No certificate
settings were changed. No account was used, no financial data was changed, and no
email was sent. No application fixes were made as part of this assessment.

Consequently, rendered layout, contrast, zoom, keyboard behavior, and realistic
new/returning-user task completion remain **pending**. Do not close #153 on the
basis of this source review alone. Follow-up issues #175–#179 are now created and
linked from #153. They are P2 items in Ready, after P1 item #157. Existing issue
requirements were preserved while adding audit evidence and dependencies.

Severity: High = risk of losing entered work; Medium = a workflow can mislead or
exclude users; Low = an improvement requiring further usability evidence.

## What already provides a useful foundation

- A central page registry supplies route names, sidebar entries, dashboard links,
  and stable tutorial target IDs.
- A persistent household bar identifies the current household, currency, and role.
- Budgeting pages consistently offer Return to dashboard and a local section menu.
- Sidebar scrolling/collapse and narrow-screen menu styles already exist; the
  earlier sidebar-scroll complaint should be regression-tested, not assumed to
  still be present.
- Invitation onboarding checks for matching pending invitations before requiring
  a new household. Tutorials can be restarted and distinguish learn-only from
  planned guided workflows.
- Draft protection, annual allocation summaries, destructive-action confirmations,
  and alert-marked errors provide useful workflow explanations.

These are code observations, not claims that visual or accessibility tests passed.

## Findings and follow-up requirements

### UI-01 — Unsaved edits can be discarded through navigation or household switching

**High. Pages:** Monthly budget, Annual targets, Transactions; shared navigation.
**Existing issue:** [#157 Unsaved-change protection](https://github.com/clroscott/BudgetApp/issues/157).

Monthly budget and annual targets use local dirty checks, but neither registers
the shared router guard. Only Transactions currently uses that guard. The
household selector changes context without consulting the guard, and changing
the household remounts the shell. Thus a user can lose unsaved edits even though
some other exits warn them.

Evidence:
[monthly local checks](https://github.com/clroscott/BudgetApp/blob/cb1df696d96d242d67b7617312b629073ffda22c/BudgetApp/budgetapp.client/src/pages/BudgetManagementPage.tsx#L162),
[annual local check](https://github.com/clroscott/BudgetApp/blob/cb1df696d96d242d67b7617312b629073ffda22c/BudgetApp/budgetapp.client/src/pages/YearlyPlanManagementPage.tsx#L144),
[household switch](https://github.com/clroscott/BudgetApp/blob/cb1df696d96d242d67b7617312b629073ffda22c/BudgetApp/budgetapp.client/src/components/AppShell.tsx#L153),
[shell remount](https://github.com/clroscott/BudgetApp/blob/cb1df696d96d242d67b7617312b629073ffda22c/BudgetApp/budgetapp.client/src/App.tsx#L59).

**Live reproduction to run:** Edit an amount without saving, then use the sidebar,
budgeting section links, Return to dashboard, Back, sign-out, or the household
selector. Repeat with a transaction correction and an annual target.

**Added to #157 acceptance:** One consistent guard covers all exits and all dirty
forms, including staged import corrections and future settings. Stay preserves
the entered values, route, household selection, and scope. Leave proceeds only
after confirmation, without duplicate prompts. Successful saves clear dirty state;
failed saves retain it. Refresh/close protection is included where browsers allow it.

### UI-02 — Annual-report transaction links lose the report's context

**Medium. Pages:** Annual overview → Transactions.
**Issue:** [#175 Preserve annual-report filters in transaction drill-downs](https://github.com/clroscott/BudgetApp/issues/175).

The report is calculated for a selected Household or Personal scope and excludes
voided, budget-excluded, and mismatched-currency transactions. Its transaction
links carry only dates and an optional category. The transaction query cannot
express all those report filters and ordinarily returns both shared and the
current user's personal transactions. Therefore the destination is not a reliable
explanation of the amount clicked. This is a reconciliation/context problem, not
evidence of a cross-user privacy leak. Root-category filtering already includes
its direct children and should be preserved.

Evidence:
[link construction](https://github.com/clroscott/BudgetApp/blob/cb1df696d96d242d67b7617312b629073ffda22c/BudgetApp/budgetapp.client/src/pages/AnnualBudgetOverviewPage.tsx#L30),
[transaction query fields](https://github.com/clroscott/BudgetApp/blob/cb1df696d96d242d67b7617312b629073ffda22c/BudgetApp/budgetapp.client/src/transactions/transactionApi.ts#L34),
[transaction visibility/filtering](https://github.com/clroscott/BudgetApp/blob/cb1df696d96d242d67b7617312b629073ffda22c/BudgetApp/BudgetApp.Infrastructure/Transactions/TransactionRepository.cs#L34),
[annual actuals filtering](https://github.com/clroscott/BudgetApp/blob/cb1df696d96d242d67b7617312b629073ffda22c/BudgetApp/BudgetApp.Infrastructure/Budgets/BudgetRepository.cs#L216).

**Acceptance:** With mixed shared/personal, included/excluded, income/expense, and
currency fixtures, each actual-spending link opens the matching transaction set
and reconciles across all pages, not just the visible page. The destination shows
its scope, dates, category, and report-specific filters clearly. Parent/child and
uncategorized links retain their intended meaning. Authorization still applies
server-side, including exports if they use the new filters. Manual filter changes
remain possible and clearly indicate when the view no longer matches the report.

**Implementation follow-up (#175):** Budget-inclusion/currency/spending filters
were introduced with #182. Drill-down context, all-page matching totals, report
selection on return, restoration/change indicators, and reconciliation/privacy
tests are now implemented. See [annual-report drill-downs](annual-report-drilldowns.md)
and the regression checklist for manual sign-off. The evidence above records
the original audited revision, not the updated behavior.

### UI-03 — Failed requests look like loading or legitimately empty data

**Medium. Pages:** Annual overview, Annual targets, Monthly budget, Household.
**Issue:** [#176 Distinguish loading, empty, and failed page states](https://github.com/clroscott/BudgetApp/issues/176).

After a failed request, annual pages set their data to null but render Loading
while it remains null. Monthly budget sets its data to null and offers No budget
and creation actions. Household falls back to No household members were found.
An error is also displayed, but these fallback messages give contradictory
information about whether the request finished and whether records exist.

Evidence:
[overview error/render](https://github.com/clroscott/BudgetApp/blob/cb1df696d96d242d67b7617312b629073ffda22c/BudgetApp/budgetapp.client/src/pages/AnnualBudgetOverviewPage.tsx#L57),
[annual-target error](https://github.com/clroscott/BudgetApp/blob/cb1df696d96d242d67b7617312b629073ffda22c/BudgetApp/budgetapp.client/src/pages/YearlyPlanManagementPage.tsx#L132),
[monthly error](https://github.com/clroscott/BudgetApp/blob/cb1df696d96d242d67b7617312b629073ffda22c/BudgetApp/budgetapp.client/src/pages/BudgetManagementPage.tsx#L153),
[household fallback](https://github.com/clroscott/BudgetApp/blob/cb1df696d96d242d67b7617312b629073ffda22c/BudgetApp/budgetapp.client/src/pages/HouseholdManagementPage.tsx#L248).

**Acceptance:** Test initial-load and refresh failures separately from successful
zero-record results. A finished failure stops the loading message, provides a safe
retry, and does not claim that records are absent. Creation/replacement actions
are not offered based on unknown data. Existing displayed data is clearly marked
stale if retained. Save failures retain edits and retries do not duplicate writes.

### UI-04 — Tutorial targets and keyboard interaction need hardening

**Medium. Pages:** Tutorials and shared navigation.
**Issue:** [#177 Make tutorials resilient to hidden targets and keyboard use](https://github.com/clroscott/BudgetApp/issues/177).
Related: [#133 planned tutorials](https://github.com/clroscott/BudgetApp/issues/133),
but this finding concerns an already available walkthrough.

The narrow-screen navigation breakpoint is 55rem (normally 880px), whereas the
tutorial opens the menu only at 760px or below. Between those breakpoints a
collapsed navigation target can exist in the DOM while remaining hidden. The
walkthrough accepts it without checking visibility and can require an impossible
click. A missing target has no explicit timeout/recovery. The overlay declares a
modal dialog but does not manage focus or prevent keyboard access to unrelated
background controls; Escape handling does exist.

Evidence:
[target lookup](https://github.com/clroscott/BudgetApp/blob/cb1df696d96d242d67b7617312b629073ffda22c/BudgetApp/budgetapp.client/src/tutorials/TutorialOverlay.tsx#L36),
[dialog declaration](https://github.com/clroscott/BudgetApp/blob/cb1df696d96d242d67b7617312b629073ffda22c/BudgetApp/budgetapp.client/src/tutorials/TutorialOverlay.tsx#L131),
[navigation breakpoint](https://github.com/clroscott/BudgetApp/blob/cb1df696d96d242d67b7617312b629073ffda22c/BudgetApp/budgetapp.client/src/App.css#L3792).

**Acceptance:** Use the actual navigation visibility state rather than conflicting
breakpoints. Exercise 760px, 800px, and 880px widths with the menu closed, plus
desktop collapse and zoom. Hidden, removed, and delayed targets have an explained
recovery path and always permit Exit. Keyboard/screen-reader users can reach the
coach controls and the intended page target, but not unrelated blocked actions.
Focus is introduced and restored deliberately. Do not apply a dialog focus trap
that prevents interacting with the highlighted control outside the dialog.

### UI-05 — Current location and page changes lack accessible navigation feedback

**Medium. Pages:** Shared shell and route transitions.
**Issue:** [#178 Add consistent keyboard and accessible page navigation](https://github.com/clroscott/BudgetApp/issues/178).

Sidebar links identify the current page only through a CSS class; the budgeting
section menu already uses `aria-current`. The routing/shell code contains no
shared route-focus, route-announcement, or skip-to-content behavior. Actual focus
order and screen-reader announcements still require live verification.

Evidence:
[sidebar links](https://github.com/clroscott/BudgetApp/blob/cb1df696d96d242d67b7617312b629073ffda22c/BudgetApp/budgetapp.client/src/components/AppShell.tsx#L22),
[route transitions](https://github.com/clroscott/BudgetApp/blob/cb1df696d96d242d67b7617312b629073ffda22c/BudgetApp/budgetapp.client/src/routing/RouterProvider.tsx#L52).

**Acceptance:** Current-page state is exposed consistently; keyboard users can
skip repeated navigation. A page transition has a meaningful title and predictable
focus/announcement without stealing focus during ordinary filter changes. All
controls retain visible focus at supported zoom. Include calculator Escape/close
and focus return as part of keyboard regression checks, not a forced modal redesign.

### UI-06 — Annual category values and a household default lack semantic labels

**Medium. Pages:** Annual overview, Annual targets.
**Issue:** [#179 Make annual financial data and fiscal defaults accessible](https://github.com/clroscott/BudgetApp/issues/179).

The annual category breakdown is a grid of generic div/span/strong elements and
its column header is hidden from accessibility tools. Values have no programmatic
association with Budgeted, Actual, Remaining, or Average/month. The household
fiscal-year default select also has no associated label or explicit accessible name.

Evidence:
[category header](https://github.com/clroscott/BudgetApp/blob/cb1df696d96d242d67b7617312b629073ffda22c/BudgetApp/budgetapp.client/src/pages/AnnualBudgetOverviewPage.tsx#L218),
[category values](https://github.com/clroscott/BudgetApp/blob/cb1df696d96d242d67b7617312b629073ffda22c/BudgetApp/budgetapp.client/src/pages/AnnualBudgetOverviewPage.tsx#L269),
[default selector](https://github.com/clroscott/BudgetApp/blob/cb1df696d96d242d67b7617312b629073ffda22c/BudgetApp/budgetapp.client/src/pages/YearlyPlanManagementPage.tsx#L400).

**Acceptance:** Every category amount exposes its category and measure through
semantic table headers or equivalent explicitly labeled structures. Parent/child
relationships, negative amounts, No budget, and budgeted zero remain distinguishable
without relying on color or indentation. The default selector has a visible,
associated label explaining that it affects new annual plans rather than existing
monthly budgets. Verify the same meanings in narrow and screen-reader layouts.

## Recommended order and existing-board alignment

1. Expand and implement #157 using UI-01; it has the clearest lost-work risk.
2. Address UI-02 and UI-03: trustworthy drill-downs and recoverable errors.
3. Address UI-04 through UI-06 before adding more tutorials or dense report pages.
4. Continue [#138 Household settings](https://github.com/clroscott/BudgetApp/issues/138)
   and [#156 Account settings](https://github.com/clroscott/BudgetApp/issues/156)
   using the shared navigation, feedback, and unsaved-work checklist.
5. Use [#154 Contextual help](https://github.com/clroscott/BudgetApp/issues/154) for
   terminology/next-action explanations and
   [#155 Saved transaction filters](https://github.com/clroscott/BudgetApp/issues/155)
   for reusable filter state. UI-02 needs correct filtering first, not merely saved filters.

**Low-priority hypothesis, not a confirmed defect:** The primary sidebar is a long
flat list, with Settings as the main grouping. In a live task walkthrough, evaluate
whether grouping transactions/imports, planning, management, and help improves
findability. Retain stable routes/tutorial IDs. Do not start a broad redesign based
only on source inspection or add redundant links without evidence.

## Live validation still required before closing #153

Use Development/Scratch fixtures from the
[manual QA plan](manual-qa-regression-test-plan.md), never Production data.

- [ ] New invited user: register/sign in, find and accept the invitation, identify
      the household, and start/exit/replay the learn-only tutorial.
- [ ] Returning user: choose the intended household/scope, set annual targets,
      allocate selected Draft months, and distinguish protected months.
- [ ] Monthly budget: edit, save, change status, navigate away with dirty values,
      cancel leaving, and follow report links back to the matching month.
- [ ] CSV workflow: upload disposable sample data, correct staged rows, apply a
      rule, approve selected rows, and find the corresponding official transactions.
- [ ] Transactions: correct a disposable transaction, cancel navigation with an
      unsaved edit, and reconcile report links using mixed-scope fixtures.
- [ ] Viewer and multi-household cases: clear disabled-action explanations and
      safe context changes with no cross-household/personal leakage.
- [ ] Keyboard/screen reader, long names, narrow/tablet screens, 200% zoom,
      dialogs/tutorials, failure recovery, and empty data.

Record actual behavior, task success, unnecessary steps, page, severity, screenshot
where useful, and related issue for each failure. Source-derived reproductions above
are test cases to run, not recorded successful manual executions.

## Reusable interface checklist

The QA plan now contains an Interface acceptance checklist to use for every new
page or substantial workflow change. This audit and those additions document what
to check; they do not mark any new checks as passed. Revisit the audit after the
live tasks and link implementation issues without duplicating existing board items.
