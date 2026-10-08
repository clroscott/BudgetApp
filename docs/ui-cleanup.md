# UI cleanup (#200)

The sidebar now offers six main destinations. Existing URLs, tutorial target IDs,
authorization rules and financial calculations are preserved.

| Main destination | Related pages |
| --- | --- |
| Dashboard | Financial overview, needs attention, quick actions, optional recent transactions |
| Transactions | Import transactions, review imports, categorization rules, CSV profiles |
| Budgeting | Monthly budget, annual targets, annual overview, recurring expenses, categories |
| Financial accounts | Shared and personal financial accounts |
| Household | Members/invitations, household settings, change history |
| Help | Contextual help topics and tutorials |

Related pages can be opened with the section's expand button or the section menu
on its pages. The current section opens by default; exact current-page and parent
location states are exposed separately. The desktop collapse preference remains
per-user. Narrow navigation scrolls when necessary and closes after accepted page
navigation. Tutorials can reveal a hidden group without clicking its destination
or changing financial data.

Account settings and sign-out are in the profile menu at the top right. Escape
closes it and returns focus to its trigger. Personal settings remain available
without a household. Application administration is in that menu only for
authorized application operators, not household administrators by implication.

The shell owns household context and the profile menu. Household pages no longer
repeat a logo/Return to dashboard header; standalone/public account workflows
retain their needed return navigation. Shared page spacing, headings, section
menus and control sizing are aligned without replacing existing page forms.

All app page containers use the same 76rem maximum content lane and shared side
gutters, including previously narrow settings/import/help pages. Short forms stay
narrow **inside** that lane and align to its left edge, rather than centering the
entire page differently. The household context header and budget save bars follow
the same lane. A stable scrollbar gutter avoids small horizontal shifts between
short and long pages.

Section tabs are the first element in their page's content lane, before the page
heading, description, contextual help and request feedback. This is actual DOM
order, not a CSS-only reorder. Different instructions or loading/error messages
therefore do not move the tabs. Route/skip focus still reaches the heading, but
starts at the natural page top so it does not scroll the tab row away. If a heading
cannot fit in a short/zoomed viewport, it is scrolled into view as before. Local
filter edits and canceled navigation retain their existing focus behavior.

## Mixed dashboard

New/default layouts have three cards: Financial overview, Needs attention and
Quick actions. Existing saved custom layouts keep their panel keys and column
count, including older shortcut cards. Customize dashboard can add summaries,
Recent transactions or the older shortcuts; dragging and Earlier/Later both work.
Reset to default deliberately adopts the three-card layout. Layout edits use the
existing unsaved-change guard; a failed save preserves the draft.
Adding/removing a card moves focus to a meaningful heading; finishing or canceling
customization returns focus to Customize dashboard. Editing controls are disabled
while the layout save is pending.

The financial summary uses a selected month and either Household or Personal
scope. Its initial month follows the selected household's time zone (UTC fallback
if a browser cannot resolve a legacy zone name). It never adds these scopes
together. Existing backend visibility and budget-inclusion
rules determine which transactions count.

- Budgeted, Actual and Remaining match the monthly budget's category totals.
  Parent actuals already include child actuals, so children are not counted twice.
  Uncategorized spending is identified separately. This is not a bank balance.
- The card labels scope, month, currency and budget status. No saved budget is
  different from a saved budget with a zero target. Negative remaining is also
  explained in text. Different currencies are not converted or combined.
- Uncategorized spending counts and drill-downs use the selected month, scope
  and budget currency. Imports awaiting review use **all visible imports** across
  months/scopes and explicitly say so.
- Recent transactions are optional, show the latest five visible records by the
  transaction list's existing ordering, and label each record's currency. They
  are not a selected-month total.
- Quick actions navigate to existing pages; they do not create records. Viewers
  receive view-only wording and do not receive the import action or setup checklist.
- The initial setup checklist appears only after successful reads show no visible
  transactions and no saved budget. It links to account creation, import/review and
  monthly planning; it never creates these automatically.

Summary reads reuse the monthly budget, accounts, imports and transactions APIs.
There are no new financial endpoints or writes, and no database migration or
configuration change. Refresh data repeats reads only. Layout saving remains the
existing per-user/per-household write.

An initial failure does not claim records are absent. A refresh failure labels
retained data as potentially stale; Retry loading is available. Permission-loss
responses remove retained data, and changing household/scope/month immediately
stops rendering the old financial context. Late responses cannot replace the new
context. Summary reads currently succeed/fail as one snapshot, rather than
presenting independently refreshed card values as a coherent total.

## Verification

Automated coverage includes grouping/current-page states, hidden tutorial groups,
profile Escape/focus return, guarded navigation/sign-out, preserved saved layouts,
failed reads/refreshes/saves, stale and late responses, explicit drill-down filters,
date boundaries, zero/negative values and parent/child totals. Backend tests cover
the updated default while retaining existing layout isolation checks.

Rendered checks used an isolated loopback preview with fictional data, including
desktop and 390px/800px layouts, the profile menu and keyboard dismissal. This is
not verification against the user's real database. Live screen-reader output and
actual 200% browser zoom remain manual QA checks, not automated conformance claims.
Alignment checks compare 18 main app pages at 1920px and 390px: content left/width
and section-tab top positions match. The five transaction-tab transitions also
retain matching heading/tab positions while correctly focusing each destination.
The monthly budget action bar reserves its measured height at the page end,
including wrapped buttons and unsaved text. Back to top joins the bar even when
the budget data/host loads asynchronously, rather than floating underneath it.
See the permanent [UI cleanup regression checklist](manual-qa-regression-test-plan.md#ui-cleanup-and-mixed-dashboard-200).
