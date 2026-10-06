# Accessible page navigation (#178)

This adds shared navigation behavior without redesigning the sidebar. It applies
to household pages, public/auth pages, and loading/error screens rendered through
the app route boundary. No database migration or configuration change is needed.

## Current location and skip navigation

The sidebar exposes `aria-current="page"` on the exact active pathname, matching
the existing budgeting section menu. Query filters do not change which page is
current. A child budgeting route does not also mark Monthly budget as current.

Skip to main content is the first app-level keyboard link. It becomes visible on
focus and moves to the current visible main heading, or the main landmark if no
heading exists. It closes only the transient narrow-screen menu, without changing
the persisted sidebar-collapse preference. It does not change the URL, append a
history entry, discard edits, or invoke a route guard. Existing main IDs are
preserved; the shared boundary assigns `main-content` when one is missing.

## Titles, route focus, and announcements

Page titles use the registry label followed by `| MC Budget`, never query values,
reset/invitation tokens, or account/financial details. On an accepted pathname
change, the shared boundary focuses the visible destination heading and announces
the page name through a polite status region. Loading fallbacks marked
`aria-busy="true"` are not mistaken for completed pages. The boundary watches for
the ready main to arrive after lazy loading.

Initial mounting sets the title without stealing focus. Same-path filter/query
changes, scope changes, canceled navigation, and household selection do not cause
route focus or a new page announcement. Back/Forward follow the same pathname
rule. If someone starts interacting while a destination is delayed, its later
arrival is still announced but does not take their focus away. An active tutorial
owns focus and announcements; exiting one does not release a stale pending page
focus request.

Programmatic focus stops use temporary `tabindex="-1"` and a visible focus marker,
not extra Tab stops. Original attributes are restored on blur/cleanup. Scrolling
allows for an overlapping sticky navigation header, not a desktop side rail.
Sidebar link rings are inset so their scrolling container does not clip them.

The shell stays mounted when households change so its switcher retains keyboard
focus. The household-specific page subtree still remounts, preventing old editor
state from carrying into a different household. Privacy, authorization, and
unsaved-change guards are unchanged.

## Calculator

The calculator remains a non-modal popover. Its trigger exposes expansion state
and the controlled dialog ID. Escape from inside the calculator (including its
trigger), Close, and Use result return focus to that trigger. Closing/Escape does
not apply an amount; only Use result does. Enter in Calculation computes without
submitting the surrounding budget form. The popover does not trap Tab, and its
content can scroll in a short/zoomed viewport.

## Applying the pattern to future pages

Every new page, including Household settings (#138) and Account settings (#156),
must pass the reusable interface checklist in
[the QA plan](manual-qa-regression-test-plan.md#reusable-interface-qa-for-new-or-changed-pages).

- Register a unique route and meaningful label; route titles are derived from it.
- Render one visible main landmark with a meaningful h1, including empty/error
  states. Mark a whole-page loading fallback busy until it is ready.
- Keep ordinary filters/scopes on the same page. Do not add effects that focus a
  heading on every refresh, selection change, or save.
- Use AppLink for guarded internal navigation; expose exact current-page state
  in any new section navigation.
- Preserve context and unsaved-change protection across navigation and household
  changes. Stateful editors belong inside the household-keyed subtree.
- Verify all controls have names, visible focus, keyboard operation, and sensible
  focus return when temporary interfaces close.

## Evidence and verification

Automated cases cover current-page semantics, skip behavior, ready/delayed
transitions, canceled navigation, same-page query history, Back/Forward, tutorial
priority, focus cleanup, sticky header scrolling, full-app household switching,
and calculator keyboard dismissal/apply. The existing tour is also exercised with
the new PageNavigation layer around its real shell/router fixture.

These component tests do not establish real screen-reader output or 200% browser
zoom behavior. Complete the permanent live cases in
[the navigation regression checklist](manual-qa-regression-test-plan.md#accessible-page-navigation-regression-178)
before signing off those behaviors. No general accessibility-conformance claim is
made by this implementation.

The approach is informed by W3C guidance on
[bypassing repeated navigation](https://www.w3.org/WAI/WCAG22/Understanding/bypass-blocks.html),
[meaningful page titles](https://www.w3.org/WAI/WCAG22/Understanding/page-titled.html),
and [predictable focus order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html).
The calculator deliberately does not adopt the
[modal-dialog focus-containment pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).
