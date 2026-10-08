using System.Diagnostics;
using System.Text.Json;
using BudgetApp.Application.Imports;
using BudgetApp.Domain.Imports;
using BudgetApp.Tests.Application.Imports;

// Opt-in CPU comparison, not a unit-test timing gate. Calls the actual service.
// All dependencies are in memory; no configuration, SQL, HTTP or SMTP is loaded.
var results = new List<object>();
foreach (var rows in new[] { 100, 1_000, 10_000 })
{
    foreach (var scenario in new[] { "no matches", "mixed matches", "duplicate keys" })
    {
        var actual = await Measure(() => CreateDuplicateFixture(rows, scenario), fixture =>
            fixture.Service.ApplyDuplicateResults(fixture.File.AccountId, fixture.Drafts, CancellationToken.None));
        var scan = await Measure(() => CreateDuplicateFixture(rows, scenario), fixture =>
        {
            foreach (var draft in fixture.Drafts)
            {
                var match = fixture.Candidates.FirstOrDefault(candidate =>
                    draft.TransactionDate == candidate.TransactionDate && draft.Amount == candidate.Amount &&
                    string.Equals(draft.Description?.Trim(), candidate.Description.Trim(), StringComparison.OrdinalIgnoreCase));
                draft.SetDuplicateResult(match is null ? ImportDraftDuplicateStatus.NoMatch : ImportDraftDuplicateStatus.PossibleDuplicate,
                    match?.TransactionId, ImportReviewFixture.Now);
            }
            return Task.CompletedTask;
        });
        results.Add(new { rows, candidates = rows, scenario, actualDuplicateService = actual, originalScanReference = scan });
    }

    var completion = await Measure(() => new ImportReviewFixture(rows), async fixture =>
    {
        var completed = await fixture.Service.CompleteAsync(fixture.File.HouseholdId, fixture.UserId,
            fixture.File.Id, CancellationToken.None);
        if (completed.CreatedTransactionCount != rows || fixture.Drafts.Any(draft => !draft.ApprovedTransactionId.HasValue))
            throw new InvalidOperationException("Benchmark completion did not link every source draft.");
    });
    results.Add(new { rows, actualCompleteService = completion });
}
Console.WriteLine(JsonSerializer.Serialize(new
{
    runtime = Environment.Version.ToString(),
    methodology = "Release; median of 5 warm runs; fixture setup excluded; actual duplicate service includes index construction; actual completion includes transaction construction/linkage and in-memory save; no database/network; no timing assertions",
    results
}, new JsonSerializerOptions { WriteIndented = true }));

static ImportReviewFixture CreateDuplicateFixture(int rows, string scenario)
{
    var fixture = new ImportReviewFixture();
    fixture.Candidates = Enumerable.Range(0, rows).Select(i => new DuplicateCandidate(Guid.NewGuid(),
        ImportReviewFixture.Date, 100m, $"Existing {(scenario == "duplicate keys" ? i % 10 : i)}")).ToArray();
    fixture.Drafts = Enumerable.Range(0, rows).Select(i => fixture.CreateDraft(i + 2, ImportReviewFixture.Date, 100m,
        scenario switch
        {
            "mixed matches" when i % 2 == 0 => $"  EXISTING {i}  ",
            "duplicate keys" => $"existing {i % 10}",
            _ => $"New {i}"
        })).ToArray();
    return fixture;
}

static async Task<Measurement> Measure(Func<ImportReviewFixture> setup, Func<ImportReviewFixture, Task> action)
{
    // Fresh fixtures prevent timing already-completed imports as a fake speedup.
    for (var i = 0; i < 2; i++) await action(setup());
    var elapsed = new double[5];
    var allocations = new long[5];
    for (var i = 0; i < elapsed.Length; i++)
    {
        var fixture = setup();
        var before = GC.GetTotalAllocatedBytes(precise: true);
        var watch = Stopwatch.StartNew();
        await action(fixture);
        watch.Stop();
        elapsed[i] = watch.Elapsed.TotalMilliseconds;
        allocations[i] = GC.GetTotalAllocatedBytes(precise: true) - before;
    }
    Array.Sort(elapsed);
    Array.Sort(allocations);
    return new Measurement(Math.Round(elapsed[2], 3), allocations[2]);
}

internal sealed record Measurement(double MedianMs, long MedianAllocatedBytes);
