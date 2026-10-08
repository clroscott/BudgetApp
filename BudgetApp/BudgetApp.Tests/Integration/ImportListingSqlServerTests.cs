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

public sealed class ImportListingSqlServerTests
{
    [Fact]
    public async Task CountsFilterStableOrderAndPagingTranslateToSqlWithoutARealConnection()
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

        var result = await repository.ListVisibleAsync(Guid.NewGuid(), Guid.NewGuid(),
            ImportListFilter.ReadyForReview, 2, 50, CancellationToken.None);

        Assert.Equal(65, result.TotalCount);
        Assert.Equal(120, result.TotalVisibleCount);
        Assert.Equal(2, result.Page);
        Assert.Equal(2, capture.Commands.Count);
        var aggregate = capture.Commands[0];
        Assert.Contains("COUNT(", aggregate);
        Assert.Contains("GROUP BY", aggregate);
        Assert.DoesNotContain("OFFSET", aggregate);
        var page = capture.Commands[1];
        Assert.Contains("ReadyForReview", page);
        Assert.Contains("[UploadedAtUtc] DESC", page);
        Assert.Contains("[Id] DESC", page);
        Assert.Contains("OFFSET", page);
        Assert.Contains("FETCH NEXT", page);
        Assert.Contains(50, capture.PageParameters);
        foreach (var sql in capture.Commands)
        {
            Assert.Contains("[HouseholdId]", sql);
            Assert.Contains("[OwnerUserId]", sql);
            Assert.Contains("[Scope]", sql);
        }
        // The SQLite-only compatibility mapping must not change Production's model.
        var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        Assert.Equal(typeof(DateTimeOffset), db.Model.FindEntityType(typeof(BudgetApp.Domain.Imports.ImportFile))!
            .FindProperty("UploadedAtUtc")!.ClrType);
        Assert.Null(db.Model.FindEntityType(typeof(BudgetApp.Domain.Imports.ImportFile))!
            .FindProperty("UploadedAtUtc")!.GetValueConverter());
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
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command,
            CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
        {
            Commands.Add(command.CommandText);
            var table = new DataTable();
            if (command.CommandText.Contains("GROUP BY", StringComparison.Ordinal))
            {
                table.Columns.Add("TotalCount", typeof(int));
                table.Columns.Add("UnfinishedCount", typeof(int));
                table.Columns.Add("ReadyForReviewCount", typeof(int));
                table.Rows.Add(120, 70, 65);
            }
            else
            {
                foreach (DbParameter parameter in command.Parameters)
                    if (parameter.Value is int value) PageParameters.Add(value);
            }
            return ValueTask.FromResult(InterceptionResult<DbDataReader>.SuppressWithResult(table.CreateDataReader()));
        }
    }
}
