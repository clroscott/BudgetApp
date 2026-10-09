using System.Net;
using System.Net.Http.Json;
using BudgetApp.Application.Dashboards;
using BudgetApp.Domain.Households;
using BudgetApp.Infrastructure.Data;
using Microsoft.Extensions.DependencyInjection;

namespace BudgetApp.Tests.Integration;

public sealed class DashboardSummaryEndpointTests(BudgetAppWebApplicationFactory factory)
    : IClassFixture<BudgetAppWebApplicationFactory>
{
    [Fact]
    public async Task Endpoint_RequiresVerifiedAuthenticatedMembership_ValidatesContext_AndDoesNotCachePrivateData()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var user = await TestIdentity.RegisterAndSignIn(client, confirmationHost: factory);
        Guid householdId;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
            var household = Household.Create("Synthetic endpoint household", "CAD", "UTC", user, DateTimeOffset.UtcNow);
            db.Households.Add(household); await db.SaveChangesAsync(); householdId = household.Id;
        }
        var path = $"/api/households/{householdId}/dashboard-summary?year=2026&month=1&scope=Household";
        var response = await client.GetAsync(path);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.CacheControl!.NoStore);
        var data = (await response.Content.ReadFromJsonAsync<DashboardSummaryModel>())!;
        Assert.Null(data.Budget.Id); Assert.Null(data.Recent); Assert.False(data.HasVisibleTransactions);
        var recent = (await client.GetFromJsonAsync<DashboardSummaryModel>($"{path}&includeRecent=true"))!;
        Assert.Empty(recent.Recent!);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync(path.Replace("month=1", "month=13"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync(path.Replace("scope=Household", "scope=NotIncluded"))).StatusCode);
        using var outsider = factory.CreateAuthenticatedTestClient();
        await TestIdentity.RegisterAndSignIn(outsider, confirmationHost: factory);
        Assert.Equal(HttpStatusCode.Forbidden, (await outsider.GetAsync(path)).StatusCode);
        using var unverified = factory.CreateAuthenticatedTestClient();
        await TestIdentity.RegisterAndSignIn(unverified);
        Assert.Equal(HttpStatusCode.Forbidden, (await unverified.GetAsync(path)).StatusCode);
        using var anonymous = factory.CreateAuthenticatedTestClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(path)).StatusCode);
    }
}
