using System.Net;
using System.Net.Http.Json;
using BudgetApp.Infrastructure.Administration;
using BudgetApp.Infrastructure.Data;
using BudgetApp.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace BudgetApp.Tests.Integration;

public sealed partial class ApplicationAdministrationTests
{
    [Fact]
    public async Task UserDirectory_LoadsWithoutSearch_IsBoundedOrderedAndContainsNoCredentialsOrFinancialData()
    {
        using var h = new Harness(); using var admin = h.Client(); await h.Admin(admin);
        var ids = new List<Guid>();
        for (var index = 0; index < 24; index++) { var id = Guid.NewGuid(); ids.Add(id); await h.Seed(id, $"user-{index:D2}@example.test"); }
        var first = (await admin.GetFromJsonAsync<UserPage>("/api/admin/users"))!;
        var second = (await admin.GetFromJsonAsync<UserPage>("/api/admin/users?page=2"))!;
        Assert.Equal(25, first.TotalCount); Assert.Equal(20, first.PageSize); Assert.Equal(20, first.Items.Length);
        Assert.Equal(5, second.Items.Length); Assert.Equal(2, second.Page);
        Assert.Empty(first.Items.Select(x => x.Id).Intersect(second.Items.Select(x => x.Id)));
        Assert.Equal(first.Items.Select(x => x.Email).Order(StringComparer.Ordinal), first.Items.Select(x => x.Email));
        Assert.Equal(ApplicationAdministratorRole.SupportAdministrator.ToString(), first.Items.Single(x => x.Id == h.AdminId).AdministratorRole);
        var json = await admin.GetStringAsync("/api/admin/users");
        foreach (var field in new[] { "passwordHash", "securityStamp", "recoveryCodes", "households", "transactions", "budgets" }) Assert.DoesNotContain(field, json);
        Assert.Equal(0, await h.AuditCount()); Assert.DoesNotContain(h.Sender.Messages, x => x.Purpose != BudgetApp.Application.Email.EmailPurpose.LoginVerification && x.Purpose != BudgetApp.Application.Email.EmailPurpose.SecurityChange);
    }

    [Fact]
    public async Task UserDirectory_FiltersNameOrEmail_EmptyIsSuccessful_AndRejectsInvalidParameters()
    {
        using var h = new Harness(); using var admin = h.Client(); await h.Admin(admin);
        var id = Guid.NewGuid(); await h.Seed(id, "learner@example.test");
        using (var scope = h.Host.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>(); var user = (await users.FindByIdAsync(id.ToString()))!;
            user.DisplayName = "Example Learner"; user.EmailConfirmed = false; user.LockoutEnd = DateTimeOffset.UtcNow.AddHours(1);
            Assert.True((await users.UpdateAsync(user)).Succeeded);
        }
        var filtered = (await admin.GetFromJsonAsync<UserPage>("/api/admin/users?search=lEaRnEr"))!;
        Assert.Single(filtered.Items); Assert.Equal(id, filtered.Items[0].Id); Assert.False(filtered.Items[0].EmailConfirmed);
        Assert.False(filtered.Items[0].MfaEnabled); Assert.NotNull(filtered.Items[0].LockedUntilUtc);
        var zero = (await admin.GetFromJsonAsync<UserPage>("/api/admin/users?search=not-a-match"))!;
        Assert.Empty(zero.Items); Assert.Equal(0, zero.TotalCount);
        foreach (var page in new[] { "0", "-1", "10001", "not-a-number" })
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.GetAsync($"/api/admin/users?page={page}")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.GetAsync("/api/admin/users?search=" + new string('a', 257))).StatusCode);
    }
    private sealed record UserPage(AdministrativeAccount[] Items, int TotalCount, int Page, int PageSize);
}
