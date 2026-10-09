# Budget actuals SQL profiling (#210)

This opt-in tool compares the pre-#210 per-transaction read algorithms with the
grouped monthly, historical and annual queries. It does **not** start the app,
use application connection configuration, authenticate users, or send email.

## Run

From the repository root, with access to a local **disposable-data** SQL Server:

```powershell
dotnet run -c Release --project tools/BudgetActualsBenchmarks -- --run --server 'HOST\SQLEXPRESS'
```

The Windows account needs permission to create databases. The tool creates a new
random `BudgetAppPerf210_<32 hex digits>` database for each size and uses
`EnsureCreated` only on that database. Creation must succeed before cleanup is
armed. It never takes an existing database name, migration target, or connection
string from the app. Connections are unpooled. Finally it drops only its newly
created database, without forced rollback or changing any other database. A
process kill/machine restart may leave its named scratch database behind: inspect
and remove that exact disposable database manually, never an application database.

`TrustServerCertificate=true` is limited to this local profiling connection; it
does not configure or endorse Production certificate trust.

## Data and checks

- Each database contains the same 27 adversarial financial rows and an additional
  1,000, 10,000 or 100,000 deterministic synthetic transactions across 12 months.
- Two users (Owner and Viewer), another household, shared/private accounts, CAD/USD,
  legacy null flags, explicit Personal + Household, a stale hidden private
  selection, exclusions, voids, inactive/parent/child categories, four-decimal
  amounts, refunds, positive income-category amounts, and uncategorized values of
  both signs are included. Tests additionally check zero versus absent budgets.
- Every monthly/history/annual result is compared exactly with the frozen old
  algorithm for both users, both scopes and both currencies on real SQL Server
  before timing. A mismatch aborts rather than producing a success report.
- SQL Server performs decimal SUM/conditional SUM and GROUP BY. SQLite tests use
  the provider's exact decimal `ef_sum`, not floating-point casts or a fallback
  materializing all transactions. See [Microsoft's provider mappings](https://learn.microsoft.com/en-us/ef/core/providers/sqlite/functions).
- Currency identity comparison remains ordinal case-insensitive for monthly and
  annual totals, applied only to already grouped currency/category summaries.
  Historical currency equality retains its original provider behavior. Stored
  account currencies remain the domain's normalized three-letter codes.

## Measurements and limitations

Each path is warmed, followed by 15 samples alternating execution order. Reports
include p50/p95 elapsed time, process-wide managed allocation bytes, rows and bytes
returned by SQL Client, and logical reads. `SET STATISTICS IO` messages are optional:
missing messages are reported as null, not zero. The actual baseline/grouped plans
also supply per-operator logical-read counters. Plans and SQL text are captured
**outside** timed runs; their read counters describe that separate execution, not
the median timed sample. Existing indexes are
not changed, and no server-wide plan/buffer cache flush is performed.

These are warm repository-read measurements on one machine, not HTTP/UI latency,
concurrent-load results or a cold-storage benchmark. The old annual timed path
returns its original per-transaction result; normalization for exact comparison
is outside timing. The new annual service additionally avoids the old 12 repeated
transaction-list scans; that service-level saving is not included in this timing.
15 samples provide a local comparison, not a universal performance guarantee or
a stable estimate of production tail latency. No machine-specific millisecond
assertion gates unit tests.

Generated `results-YYYYMMDD-HHmmss` directories contain only synthetic reports,
SQL and plans (no passwords, real records or application secrets). Preserve the
chosen successful report for review; failed partial reports need not be committed.
The fixture and frozen reader are also linked into the automated parity tests,
so profiling cannot silently drift to unrelated financial semantics.

## Recorded local run: 2026-10-08

[Full results](results-20261008-232429/results.json), alongside baseline/grouped SQL
and actual plans for every size. Release/.NET 10.0.12, SQL Server 2022 Express
16.0.1200.5, 15 alternating warm samples per path. Exact parity passed for all
user/scope/currency combinations at all three data sizes.

At 100,000 generated transactions (plus the edge cases):

| Read | SQL rows, old → grouped | Managed allocation, old → grouped | p50 ms, old → grouped | p95 ms, old → grouped |
| --- | --- | --- | --- | --- |
| Monthly | 8,503 → 6 | 3.32 MB → 0.083 MB | 21.16 → 19.70 | 29.91 → 20.76 |
| Historical | 100,009 → 37 | 37.36 MB → 0.092 MB | 120.64 → 74.96 | 135.73 → 110.65 |
| Annual | 100,017 → 42 | 48.05 MB → 0.117 MB | 149.91 → 149.75 | 228.15 → 181.69 |

Annual wire bytes fell from 4,308,040 to 5,394. Annual median latency was essentially
unchanged locally; the verified benefit is bounded transfer/allocation, not a claim
that every query is faster. At 1k, annual p50 was slightly slower (4.64 → 5.14 ms).

Actual grouped plans showed no spills/warnings in this final run. They used existing
clustered index scans/seeks and stream/hash aggregates; no indexes were added. At
100k, baseline/grouped plan logical reads were 2,816/2,834 monthly and 2,816/2,816
historical/annual. The separate 10k historical plan chose nested loops and higher
read counts (298 → 20,326), so this is **not** a uniform logical-I/O improvement.
Retain that evidence for future representative distribution/concurrency profiling
rather than adding an index or hint solely to tune this small synthetic fixture.

Full automated regression: 521 backend tests, 493 client tests, client lint/build.
Live manual budget/report spot checks remain pending; they are not inferred from
these automated results.

## Manual sign-off

No schema migration or financial-data rewrite is needed. Before merge, spot-check
the Monthly budget and Annual overview against their transaction drill-downs in
both scopes, including a refund and uncategorized spending/income. Confirm history
averages and zero/missing budgets are unchanged. See the permanent #210 section
in `docs/manual-qa-regression-test-plan.md`. Automated profiling does not mark live
manual QA complete.
