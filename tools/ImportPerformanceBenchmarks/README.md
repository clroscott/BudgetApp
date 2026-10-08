# Import CPU benchmark (#208)

From the repository root:

```powershell
dotnet run --project tools/ImportPerformanceBenchmarks -c Release
```

This small opt-in console harness calls the real `ImportReviewService` using the
same in-memory fixture as the service tests. It uses no SQL connection, app
configuration, real financial data, or email sender. No new packages are needed.

For 100 / 1,000 / 10,000 drafts and equally many candidates, it measures no-match,
mixed-match, and repeated-key cases. The actual duplicate measurement includes
lookup construction. The scan reference reproduces the old comparison loop; it
is not a second production implementation. Completion calls the real method with
a fresh approved import for every run and verifies all rows were linked.

Two warmups precede five measured runs. Fixture generation is outside the timer;
transaction construction and in-memory repository writes are inside completion's
timer. Report median elapsed time and managed allocations. These numbers are CPU
evidence, not end-to-end SQL/application latency or unit-test pass thresholds.

The intended work is O(candidates + drafts) expected hash lookup time (plus the
characters read by trimming/comparison/hashing), and one pass over approved rows
for completion linkage. Repeated candidate keys keep the first supplied ID. No
new ordering guarantee is imposed on the repository's existing candidate query.

Large response payloads, SQL row loading and import paging remain #209 / #212.

## Recorded run (2026-10-08)

Release application assemblies; .NET 10.0.12. The final run was not concurrent
with the automated suites. Full cases and managed-allocation counts are in
[results-2026-10-08.json](results-2026-10-08.json).

Same-date/same-amount **nonmatches**, with equally many drafts and candidates:

| Rows | Old scan reference (ms) | Actual lookup, including construction (ms) |
| ---: | ---: | ---: |
| 100 | 0.361 | 0.057 |
| 1,000 | 5.254 | 0.535 |
| 10,000 | 519.814 | 2.393 |

At 10,000 rows, mixed matches measured 679.456 ms / 1.846 ms; repeated keys
measured 1.484 ms / 1.377 ms (scan / lookup). Repeated-key scans already find
early matches cheaply, so the new index is not faster for every small/best-case
input. The major gain is removing the quadratic late-match/no-match path.

The lookup trades bounded per-operation memory for speed: at 10,000 distinct
keys this run allocated about 2.10 MB versus 0.88 MB for the scan reference.
Allocations grow roughly with rows; there is no persistent/global cache.

Actual completion, including transaction/ID construction and in-memory writes,
measured 0.068 / 0.599 / 12.500 ms at 100 / 1,000 / 10,000 rows, allocating
32,024 / 305,720 / 3,144,584 bytes. Wall-clock ratios include GC, JIT and ID
generation and are not strict linearity assertions. Structural service tests
also count collection visits: candidates are enumerated once, and completion's
draft visits are bounded by a small number of linear passes, not per-row scans.

These are local synthetic measurements, not SQL Server timings or a promise of
the same end-to-end import speed on another machine. Browser manual QA and large
payload/database work remain separate.
