# Import-review draft rendering (#213)

## Change and boundaries

The row editor and batch controls now have separate component boundaries. The row
editor uses measured memoization with stable callbacks and ordinary prop comparison.
The draft cache skips unchanged updates/removals and keeps budget flags and edited-ID
membership stable while text/date/category values change. Bulk preview counts depend
on those flags; full correction objects are built only when Apply is chosen, using
the latest corrections (including explicit clears).

No API, financial calculation, permission, approval or completion contract changes.
No new state framework or virtualization. Async callbacks remain scoped to their
household/import lifetime, including returning to a previously selected import.

## Reproducible browser profile (2026-10-14)

Run [the isolated profiling harness](../tools/LayoutQa/README.md#import-rendering-profile-213)
on the unchanged baseline and the changed source. This capture used Edge
155.0.4283.45, Node v24.18.0, Windows, 1440×900, 10,000 fictional rows and 100
rendered rows. Three fresh-browser-context repetitions per capture, same browser
and dataset. Baseline: branch starting point `ff19417`; final: this #213 change.
No production database, real email or financial writes.

This is Vite development React with StrictMode and injected profiling. React times
are sums of Profiler `actualDuration` per interaction, averaged across repetitions;
they are not wall-clock response latency or production predictions. Row renders and
preview visits include development's repeated render work. Each typing case enters
20 characters with a 16 ms delay. Filtering switches to an empty category filter and
back. Bulk selection chooses Personal + Household; staging applies it to all rows.

| Interaction | Commits before → after | React ms before → after | Row renders before → after | Preview row visits before → after |
| --- | ---: | ---: | ---: | ---: |
| Type, no bulk preset | 40 → 40 | 444.70 → 187.43 | 4,040 → 278 | 0 → 0 |
| Filter away and back | 7 → 7 | 78.90 → 209.53 | 400 → 200 | 0 → 0 |
| Select full-batch preset | 3 → 3 | 171.13 → 9.67 | 600 → 0 | 20,000 → 20,000 |
| Stage 10,000 choices | 3 → 3 | 167.80 → 201.57 | 600 → 400 | 60,000 → 30,000 |
| Type with 10,000 corrections staged | 40 → 40 | 345.17 → 155.83 | 4,040 → 80 | 400,000 → 0 |

| Interaction | Long-task count across 3 runs, before → after | Largest task ms, before → after |
| --- | ---: | ---: |
| Type, no bulk preset | 8 → 2 | 147 → 154 |
| Filter away and back | 6 → 3 | 86 → 221 |
| Select full-batch preset | 3 → 0 | 167 → 0 |
| Stage 10,000 choices | 6 → 3 | 133 → 276 |
| Type with 10,000 corrections staged | 6 → 0 | 96 → 0 |

Typing with a fully staged batch renders only the edited row (98% fewer row renders)
and does not revisit all candidates. Commit counts are unchanged: local form state
and parent dirty-state notification still commit; less work happens in each commit.
The first edited ID can still invalidate the existing read-only matching preview,
temporarily disabling other rows while it refreshes; this is reflected in the
no-preset case rather than hidden from the measurements.

Filtering and staging were **not faster** in this capture; their maximum long tasks
increased despite fewer renders/scans. All 100 visible editors still mount after
filtering, and applying 10,000 local corrections still copies/indexes that batch.
These results do not establish the cause of the timing differences. This change
does not claim to eliminate those pauses. Reprofile before considering further
mount/bulk-work optimization; the evidence does not authorize blanket memoization,
a new state framework or virtualization.

Raw evidence is local/ignored under `artifacts/import-rendering-qa/before` and
`after-final`, including every sample and browser version. The intermediate `after`
capture was not used in these tables. Keep the baseline intact. No machine-specific
millisecond thresholds are used as unit-test gates.

## Regression verification

Automated coverage includes no-op cache identity, 10,000-entry text edits retaining
budget indexes, explicit-clear/off-page/bulk preservation, count-only/full-preview
parity, context changes including A → B → A, unchanged-row render bailout, focused
input preservation and permission changes that must rerender protected controls.
Existing unsaved-change, failure and import integration tests remain applicable.

The fictional-data browser harness separately exercises bounded paging, correction
preservation, bulk staging, targeted saves, approval/completion and failed/late reads.
It is not a substitute for the owner's
[permanent manual keyboard/focus cases](manual-qa-regression-test-plan.md#import-review-rendering-and-draft-cache-regression-213).

Verification for this change: 641 frontend tests, 677 backend tests, six rendered
paging/bulk/save/completion cases and ten read/failure/race cases passed. The full
Release solution build and client TypeScript/Vite build passed. Client lint exited
successfully with existing warnings (including the row effects moved out of the
page); those unrelated warnings were not suppressed or expanded into this refactor.
The owner's manual cases above remain pending.
