# Household settings (#138)

Open Manage household → Settings (`/household/settings`). Members/invitations and
settings have separate, accessible section links; there is no extra sidebar item
or changed tutorial target ID. The page participates in the shared route title,
skip-to-content, route focus, and announcements.

## Shared settings and permissions

All active members can view the selected household's name, time-zone preference,
fiscal-year starting-month default, and default currency. Only Owner/Admin can
save them. Editor budget-editing permissions are unchanged.

`GET/PUT /api/households/{householdId}/settings` enforce membership on the server.
The old `PUT .../yearly-plans/default-start-month` endpoint remains compatible but
now uses the same manager-only settings service/repository. It changes only the
default month, not other fields. An old client cannot bypass the stricter roles.

Annual Targets displays the shared default and a settings link. Its `Fiscal year
begins` selector still edits that particular plan. The only shared default field
is `Household.FiscalYearStartMonth`; there is no copied settings table or second
editor. Defaults do not rewrite saved annual plans or monthly budgets.

Time zone is validated using the same system-supported IDs as onboarding. It is
a stored preference; this change does not introduce time-zone-driven financial
calculations or reinterpret historical transaction dates. The onboarding wording
was corrected to match that behavior.

## Currency safeguards

An unused household can change its default currency, provided it is supported.
Categories alone do not lock it. The presence of any accounts (including private
or archived accounts), imports, monthly budgets, annual plans, transactions, or
recurring expenses prevents a currency change. Name/time-zone/fiscal edits are
still allowed. This is not currency conversion.

The API returns eligibility and a general explanation, not private record counts
or details. Eligibility is checked again inside the save transaction, so financial
data added after the form loaded rejects the complete currency-change request.
It cannot partially save another setting before rejecting the currency.

## Saving, conflict protection, and activity

The form sends the existing `Household.UpdatedAtUtc` as its version. Stale writes
return 409 rather than silently overwriting newer values. Meaningful changes
advance the version monotonically, including under a frozen clock. Unchanged
saves leave the version alone and do not create activity.

Repository writes use a serializable transaction; SQL Server obtains an
`UPDLOCK/HOLDLOCK` on the household row before editing, avoiding shared-lock
upgrade conflicts between settings writers. Financial checks and the membership
recheck share that transaction. Household changes and their household-visible
activity record commit together. Activity lists only changed settings, never
private transaction/account data. No database schema migration is required.

Save failures keep edits and unsaved-change protection. Conflict/permission
responses require an explicit reload before another save; a dirty reload asks
before discarding. Initial/refresh failures use the shared feedback pattern;
retained stale values cannot be saved. Read-access denial hides retained data.
Navigation, household switching, sign-out, Cancel and browser unload use the
existing guard. The form prevents overlapping writes and never retries writes
automatically. After acknowledged success, it updates the household context from
the response without another read or a fragile post-save refresh dependency.

## Verification

27 new in-memory integration cases cover roles and both write endpoints,
authentication/antiforgery, validation, persistence, currency locks across data
types and late additions, repeated/stale writes, no-op activity, historical data,
and new-plan defaults. Eighteen frontend cases cover labels/section states,
permissions, initial/refresh/save failures, conflict recovery, dirty navigation,
household switching, duplicate-click protection, and header updates.

An isolated Chromium sample rendered the actual shell/pages/CSS at desktop and
390px width, with no real backend, database, or emails. It verified no whole-page
horizontal overflow, native arrow-key month selection, visible Save focus,
saving feedback, and deliberate heading focus between household sections. The
temporary preview was removed. Full live screen-reader speech, actual 200% zoom,
and simultaneous SQL Server writers remain explicit manual sign-off cases in
[the permanent QA checklist](manual-qa-regression-test-plan.md#household-settings-regression-138).
