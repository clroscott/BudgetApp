# Unsaved-change protection

BudgetApp uses one shared navigation guard registry. Each mounted editor owns its
own guard; saving or unmounting one editor cannot clear another editor's warning.
This is protection against accidental loss, not autosave or draft recovery.
Unsaved form snapshots stay in memory and are not written to browser storage.

## Adding an editable page

- For an existing dirty-value comparison, call
  `useUnsavedChangesGuard(isDirty, message)`.
- For a controlled form, use `useUnsavedForm(value, message)`. Call
  `markClean(savedValue)` after a successful save or when explicitly loading a new
  editor baseline. Keep the current values and baseline unchanged on save failure.
- For an uncontrolled native form, spread `useUnsavedNativeForm(message).formProps`
  onto the form. After a successful create, reset the form and call `markClean()`.
- Use the returned `confirmDiscard()` before a local action that replaces or
  cancels that editor. Update values and selections only after it returns true.
- Use the router's `confirmNavigation()` before a context-changing operation that
  affects all editors, such as logout. Route links and household selection already
  consult the shared registry; do not add a second confirmation to those links.

The router combines active editor messages into one confirmation, restores canceled
Back/Forward navigation using the existing history entry, and installs one native
`beforeunload` handler. Browsers choose the refresh/close warning text and may
restrict when it appears.

Household selection checks the guard in `HouseholdProvider`, before changing state
or the stored household ID. A canceled switch must not close or reset the editor.

`bypassBlocker` is reserved for an already-consented operation's successful redirect
or a metadata-only URL update. Do not use it to bypass a potentially destructive
user navigation. Tutorial progression must honor a canceled `navigate()` result.

## Verification

Run `npm test`, `npm run build`, and `npm run lint` from
`BudgetApp/budgetapp.client`. Client tests use isolated DOM fixtures and mocked APIs;
they do not connect to a database or send email. The PR build runs these tests too.

Run the [manual regression checklist](manual-qa-regression-test-plan.md) in
Development or Scratch, especially the unsaved-change section. Account and household
settings added in future issues should adopt these same helpers.

This feature has no database migration or Production configuration changes.
