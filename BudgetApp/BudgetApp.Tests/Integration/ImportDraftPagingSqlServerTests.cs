using System.Data;
using System.Data.Common;
using BudgetApp.Application.Imports;
using BudgetApp.Infrastructure;
using BudgetApp.Infrastructure.Data;
using BudgetApp.Infrastructure.Email;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;

namespace BudgetApp.Tests.Integration;

public sealed class ImportDraftPagingSqlServerTests
{
    [Fact]
    public async Task TargetedReadsKeepImportBoundaryAndChunkSqlParameterLists()
    {
        var capture = new CaptureQueries();
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddInfrastructure("Server=unused;Database=unused;Integrated Security=True;",
            new EmailOptions(), new ApplicationUrlOptions(), false);
        services.AddDbContext<BudgetAppDbContext>(options => options.AddInterceptors(new NoConnection(), capture));
        using var provider = services.BuildServiceProvider();
        using var scope = provider.CreateScope();
        var repo = scope.ServiceProvider.GetRequiredService<IImportRepository>();
        var ids = Enumerable.Range(0, 1200).Select(_ => Guid.NewGuid()).ToArray();
        await repo.GetDraftsForUpdateAsync(Guid.NewGuid(), ids, CancellationToken.None);
        Assert.Equal(3, capture.Commands.Count);
        Assert.All(capture.Commands, sql => { Assert.Contains("[ImportFileId]", sql); Assert.Contains(" IN ", sql); });
        Assert.All(capture.ParameterCounts, count => Assert.InRange(count, 1, 501));
    }
    [Theory]
    [InlineData(ImportDraftFilter.All)]
    [InlineData(ImportDraftFilter.ParentOnly)]
    public async Task BulkPreviewAndRulePreviewUseMinimalSqlProjections(ImportDraftFilter filter)
    {
        var capture = new CaptureQueries();
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddInfrastructure("Server=unused;Database=unused;Integrated Security=True;", new EmailOptions(), new ApplicationUrlOptions(), false);
        services.AddDbContext<BudgetAppDbContext>(options => options.AddInterceptors(new NoConnection(), capture));
        using var provider = services.BuildServiceProvider();
        using var scope = provider.CreateScope();
        var repo = scope.ServiceProvider.GetRequiredService<IImportRepository>();
        await repo.PreviewBudgetChoicesAsync(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), filter,
            true, false, true, false, Enumerable.Range(0, 1001).Select(_ => Guid.NewGuid()).ToArray(), CancellationToken.None);
        await repo.ListRuleMatchingDraftsAsync(Guid.NewGuid(), CancellationToken.None);
        Assert.All(capture.Commands, sql => {
            Assert.Contains("[ImportFileId]", sql);
            Assert.DoesNotContain("[RawData]", sql);
            Assert.DoesNotContain("[OriginalDescription]", sql);
        });
        Assert.All(capture.ParameterCounts, count => Assert.InRange(count, 1, 510));
        Assert.Empty(scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>().ChangeTracker.Entries());
    }

    [Theory]
    [InlineData(ImportDraftFilter.All)]
    [InlineData(ImportDraftFilter.Pending)]
    [InlineData(ImportDraftFilter.Uncategorized)]
    [InlineData(ImportDraftFilter.ParentOnly)]
    [InlineData(ImportDraftFilter.Categorized)]
    [InlineData(ImportDraftFilter.PossibleDuplicates)]
    [InlineData(ImportDraftFilter.Invalid)]
    [InlineData(ImportDraftFilter.Approved)]
    [InlineData(ImportDraftFilter.Excluded)]
    public async Task AllFiltersAggregateAndPageInSqlWithoutLoadingTrackedEntitiesOrConnecting(ImportDraftFilter filter)
    {
        var capture = new CaptureQueries();
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddInfrastructure("Server=unused;Database=unused;Integrated Security=True;",
            new EmailOptions(), new ApplicationUrlOptions(), false);
        services.AddDbContext<BudgetAppDbContext>(options => options.AddInterceptors(new NoConnection(), capture));
        using var provider = services.BuildServiceProvider();
        using var scope = provider.CreateScope();
        var repository = scope.ServiceProvider.GetRequiredService<IImportRepository>();
        var counts = await repository.GetDraftCountsAsync(Guid.NewGuid(), CancellationToken.None);
        var result = await repository.ListDraftPageAsync(Guid.NewGuid(), Guid.NewGuid(), filter, 2, 100, CancellationToken.None);
        Assert.Equal(10000, counts.TotalRows);
        Assert.Equal(101, result.TotalCount);
        Assert.Equal(2, result.Page);
        Assert.Equal(3, capture.Commands.Count);
        var aggregate = capture.Commands[0];
        Assert.Contains("GROUP BY", aggregate);
        Assert.Contains("COUNT(", aggregate);
        Assert.DoesNotContain("[RawData]", aggregate);
        Assert.DoesNotContain("[RawData]", capture.Commands[1]);
        var page = capture.Commands[2];
        Assert.Contains("[SourceRowNumber]", page);
        Assert.Contains("[Id]", page);
        Assert.Contains("ORDER BY", page);
        Assert.Contains("OFFSET", page);
        Assert.Contains("FETCH NEXT", page);
        Assert.Contains("[RawData]", page); // Only the requested page needs legacy labels.
        Assert.DoesNotContain("[OriginalDescription]", page);
        Assert.DoesNotContain("[OriginalAmount]", page);
        Assert.DoesNotContain("[CreatedAtUtc]", page);
        if (filter == ImportDraftFilter.ParentOnly)
        {
            Assert.Contains("EXISTS", page);
            Assert.Contains("[ParentCategoryId]", page);
            Assert.Contains("[HouseholdId]", page);
        }
        Assert.All(capture.Commands, sql => Assert.Contains("[ImportFileId]", sql));
        Assert.Contains(100, capture.PageParameters);
        Assert.Empty(scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>().ChangeTracker.Entries());
    }

    private sealed class NoConnection : DbConnectionInterceptor
    {
        public override ValueTask<InterceptionResult> ConnectionOpeningAsync(DbConnection connection,
            ConnectionEventData eventData, InterceptionResult result, CancellationToken cancellationToken = default) =>
            ValueTask.FromResult(InterceptionResult.Suppress());
    }
    private sealed class CaptureQueries : DbCommandInterceptor
    {
        internal List<string> Commands { get; } = [];
        internal List<int> PageParameters { get; } = [];
        internal List<int> ParameterCounts { get; } = [];
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command,
            CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
        {
            Commands.Add(command.CommandText);
            ParameterCounts.Add(command.Parameters.Count);
            var table = new DataTable();
            if (command.CommandText.Contains("GROUP BY", StringComparison.Ordinal))
            {
                foreach (var name in new[] { "Total", "Valid", "Invalid", "Approved", "Excluded", "Duplicates", "Pending", "Unchecked", "ValidPending" })
                    table.Columns.Add(name, typeof(int));
                table.Rows.Add(10000, 9000, 1000, 2000, 1000, 300, 7000, 400, 6500);
            }
            else if (command.CommandText.Contains("OFFSET", StringComparison.Ordinal))
            {
                foreach (DbParameter parameter in command.Parameters)
                    if (parameter.Value is int value) PageParameters.Add(value);
            }
            else if (command.CommandText.Contains("COUNT(", StringComparison.Ordinal))
            {
                table.Columns.Add("Count", typeof(int));
                table.Rows.Add(101);
            }
            return ValueTask.FromResult(InterceptionResult<DbDataReader>.SuppressWithResult(table.CreateDataReader()));
        }
    }
}
