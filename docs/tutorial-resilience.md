# Tutorial target recovery and keyboard use (#177)

This hardens the existing seven-step Getting started tour, not the planned #133
workflows. Its key, version, target IDs, and Learn only / Guided setup / Guided
financial task distinctions remain unchanged. No database migration is required.

## Target resolution and recovery

Targets must be connected, rendered, and not hidden by their ancestors. Required
click targets must also be enabled. Resolution watches DOM/layout changes after
success as well as before it: a disappearing or newly hidden target starts a new
bounded wait. A visible duplicate wins over a hidden copy. Spotlight bounds are
clipped to the viewport, and targets are scrolled into view without animation.

If a navigation link is hidden and the actual menu toggle is visible and closed,
the shell receives a reveal-navigation event. It opens only the transient mobile
menu state; it does not click a task control or change the saved desktop sidebar
collapse preference. There is no separate tutorial pixel breakpoint to maintain.

After five seconds without a usable target, the coach explains the situation and
offers Retry target and Exit. Learn-only tours also offer Skip step. A guided
informational step can explicitly opt into skipping with
`canSkipWhenUnavailable`; required guided actions cannot be skipped this way.
Retry repeats visual lookup only, not the page's API request or any write. A
target that arrives later is picked up automatically, even after the timeout.

## Keyboard and screen-reader policy

The coach is a named region rather than an `aria-modal` dialog, because the
intended page control is outside the coach and must remain usable. Unrelated
subtrees are temporarily inert. Both the coach and the highlighted subtree remain
available; Tab and Shift-Tab cycle through their enabled visible controls.
Escape always exits. Each new step focuses its coach heading. Go to highlighted
control / Read highlighted area moves focus without activating anything, and
adds the step instructions as a temporary accessible description.

For informational Learn-only steps, controls inside the highlighted subtree are
also blocked: highlighting a title that includes a Customize button or checkbox
does not grant permission to operate it. Learn-only click steps are restricted to
internal navigation links with stable `nav-` target IDs. Guided tutorials allow
the intended user-operated control; recovery never synthesizes its click.

On exit, inert and temporary focus/description changes are restored. Focus returns
to the launch control if it still exists and is visible; otherwise it moves to a
current page heading or tutorial navigation link. Delayed restoration must not
steal focus from a replay. Existing application-owned inert flags are preserved.

This distinction follows the behavior of [native inert](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/inert)
and avoids claiming the [modal-dialog interaction pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
while allowing interaction outside the coach.

## Navigation and persistence

Back, Next, Skip, and Finish use the existing guarded router. A canceled navigation
click does not advance the tour or repeat the unsaved-change prompt. Modified
clicks do not advance. Queued click advancement is canceled when the step or tour
ends. Finish returns to Tutorials; Exit stays on the current page.

Exit and Finish remove the overlay before waiting for tutorial-progress saves.
Checkpoint writes are serialized so a slow earlier checkpoint cannot overwrite a
newer completion/replay save. Late initial progress loads do not overwrite newer
local progress. Progress failures are shown independently of page data and do not
prevent continuing or exiting. Only tutorial metadata is saved by Learn-only tours;
financial records and household configuration are not written.

## Verification

`TutorialOverlay.test.tsx` covers target visibility, hidden duplicates, delayed and
removed targets, bounded recovery, guided skip restrictions, keyboard access,
background blocking, restoration, and navigation click cancellation.
`TutorialProvider.test.tsx` exercises the real AppShell, guarded router, complete
tour/replay/resume, delayed/failed persistence, and checkpoint ordering.

jsdom has no layout engine: the automated 760/800/880px and zoom-reduced-viewport
cases model rendered visibility, not browser media queries or real 200% zoom.
Run the permanent browser, responsive, keyboard, and screen-reader cases in
[the QA checklist](manual-qa-regression-test-plan.md#tutorial-resilience-regression-177)
before signing off those live behaviors. Do not mark manual cases passed solely
because the component tests pass.
