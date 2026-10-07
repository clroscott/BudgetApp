using System.Net;
using System.Net.Http.Json;
using BudgetApp.Application.Authentication;
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
    public async Task FirstOwnerSetup_IsExplicitOnceOnly_Audited_AndCannotReopenAfterGrantsAreRemoved()
    {
        using var h = new Harness(); var id = Guid.NewGuid(); await h.Seed(id, "first@example.test");
        using var scope = h.Host.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        var service = scope.ServiceProvider.GetRequiredService<ApplicationOwnerBootstrapService>();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        Assert.Empty(await db.ApplicationAdministratorGrants.ToListAsync());
        await Assert.ThrowsAsync<AdministrationException>(() => service.BootstrapAsync("first@example.test", default));
        Assert.False((await db.ApplicationAdministrationStates.SingleAsync()).BootstrapCompleted);
        var user = (await users.FindByIdAsync(id.ToString()))!;
        Assert.True((await users.SetTwoFactorEnabledAsync(user, true)).Succeeded);
        var oldStamp = user.SecurityStamp;
        var result = await service.BootstrapAsync("FIRST@example.test", default);
        Assert.Equal("Succeeded", result.Outcome);
        Assert.Equal(ApplicationAdministratorRole.InstallationOwner, (await db.ApplicationAdministratorGrants.SingleAsync()).Role);
        Assert.NotEqual(oldStamp, user.SecurityStamp);
        Assert.Equal("BootstrapOwner", (await db.AdministrativeAuditEvents.SingleAsync()).Action);
        Assert.Contains("initial installation owner", h.Sender.Messages.Last().PlainTextBody);
        await Assert.ThrowsAsync<AdministrationException>(() => service.BootstrapAsync("first@example.test", default));
        db.ApplicationAdministratorGrants.Remove(await db.ApplicationAdministratorGrants.SingleAsync()); await db.SaveChangesAsync();
        await Assert.ThrowsAsync<AdministrationException>(() => service.BootstrapAsync("first@example.test", default));
        using var browser = h.Client();
        Assert.Equal(HttpStatusCode.MethodNotAllowed, (await TestIdentity.Post(browser, "/api/admin/bootstrap-owner", new { email = "first@example.test" })).StatusCode);
    }

    [Fact]
    public async Task SupportAdministratorsCannotListOrGrantAdministrators_EvenWithFreshProof()
    {
        using var h = new Harness(); using var support = h.Client(); await h.Admin(support);
        var (id, client) = await h.Target(mfa: true); using var target = client;
        Assert.Equal(HttpStatusCode.Forbidden, (await support.GetAsync("/api/admin/administrators")).StatusCode);
        var request = await h.Request(support, id, ApplicationAdministrationService.GrantSupport);
        Assert.Equal(HttpStatusCode.Forbidden, (await TestIdentity.Post(support, "/api/admin/actions/prepare", request)).StatusCode);
        var supportRequest = await h.Request(support, id, ApplicationAdministrationService.RevokeSessions);
        var challenge = await h.Prepare(support, supportRequest);
        Assert.Equal(HttpStatusCode.Forbidden, (await h.Complete(support, request, h.Proof(challenge))).StatusCode);
        using var scope = h.Host.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        Assert.Single(await db.ApplicationAdministratorGrants.ToListAsync());
        Assert.Equal(HttpStatusCode.OK, (await target.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task OwnerGrantAndRemoval_RequireFreshBoundMfa_AreAuditedNotifiedAndImmediatelyEffective()
    {
        using var h = new Harness(); using var owner = h.Client(); await h.Admin(owner, role: ApplicationAdministratorRole.InstallationOwner);
        var (id, client) = await h.Target(mfa: true); using var target = client;
        Assert.Equal(HttpStatusCode.OK, (await owner.GetAsync("/api/admin/administrators")).StatusCode);
        var request = await h.Request(owner, id, ApplicationAdministrationService.GrantSupport);
        Assert.False((await owner.PostAsJsonAsync("/api/admin/actions/prepare", request)).IsSuccessStatusCode);
        var challenge = await h.Prepare(owner, request); var proof = h.Proof(challenge);
        var wrong = request with { Action = ApplicationAdministrationService.GrantOwner };
        Assert.Equal(HttpStatusCode.BadRequest, (await h.Complete(owner, wrong, proof)).StatusCode);
        h.Clock.Advance(61); request = await h.Request(owner, id, ApplicationAdministrationService.GrantSupport);
        challenge = await h.Prepare(owner, request); proof = h.Proof(challenge);
        (await h.Complete(owner, request, proof)).EnsureSuccessStatusCode();
        var mailCount = h.Sender.Messages.Count;
        (await h.Complete(owner, request, proof)).EnsureSuccessStatusCode(); Assert.Equal(mailCount, h.Sender.Messages.Count);
        Assert.Equal(HttpStatusCode.Unauthorized, (await target.GetAsync("/api/auth/me")).StatusCode);
        await LoginMfa(h, target, h.TargetEmail);
        Assert.Equal(HttpStatusCode.OK, (await target.GetAsync("/api/admin/accounts?search=operator")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await target.GetAsync("/api/admin/administrators")).StatusCode);
        var fresh = (await owner.GetFromJsonAsync<AdministrativeAccount>($"/api/admin/accounts/{id}"))!;
        Assert.Equal("SupportAdministrator", fresh.AdministratorRole);
        h.Clock.Advance(61); var remove = await h.Request(owner, id, ApplicationAdministrationService.RemoveAdministrator);
        var removeChallenge = await h.Prepare(owner, remove);
        (await h.Complete(owner, remove, h.Proof(removeChallenge))).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Unauthorized, (await target.GetAsync("/api/admin/audit")).StatusCode);
        await LoginMfa(h, target, h.TargetEmail);
        Assert.Equal(HttpStatusCode.Forbidden, (await target.GetAsync("/api/admin/audit")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await target.GetAsync("/api/auth/me")).StatusCode);
        using var scope = h.Host.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        Assert.Equal(0, await db.AuditEvents.CountAsync()); Assert.Equal(0, await db.Transactions.CountAsync());
        Assert.Contains(h.Sender.Messages, x => x.RecipientAddress == h.TargetEmail && x.PlainTextBody.Contains("access was removed"));
    }

    [Fact]
    public async Task LastOwner_CannotBeRemovedDemotedOrHaveMfaDisabled()
    {
        using var h = new Harness(); using var owner = h.Client(); await h.Admin(owner, role: ApplicationAdministratorRole.InstallationOwner);
        foreach (var action in new[] { ApplicationAdministrationService.RemoveAdministrator, ApplicationAdministrationService.GrantSupport })
        {
            var request = await h.Request(owner, h.AdminId, action);
            Assert.Equal(HttpStatusCode.Conflict, (await TestIdentity.Post(owner, "/api/admin/actions/prepare", request)).StatusCode);
        }
        var challengeResponse = await TestIdentity.Post(owner, "/api/auth/verification/challenge", new { purpose = "Disable", currentPassword = TestIdentity.Password });
        challengeResponse.EnsureSuccessStatusCode(); var challenge = (await challengeResponse.Content.ReadFromJsonAsync<VerificationChallenge>())!;
        var disabled = await TestIdentity.Post(owner, "/api/auth/verification/disable", new { currentPassword = TestIdentity.Password, proof = h.Proof(challenge) });
        Assert.Equal(HttpStatusCode.BadRequest, disabled.StatusCode);
        Assert.Contains("installation owner", await disabled.Content.ReadAsStringAsync());
        using var scope = h.Host.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        Assert.True((await db.Users.SingleAsync()).TwoFactorEnabled);
        Assert.Equal(ApplicationAdministratorRole.InstallationOwner, (await db.ApplicationAdministratorGrants.SingleAsync()).Role);
    }

    [Fact]
    public async Task NewAdministratorNeedsVerifiedEmailAndMfa_AndStaleGrantVersionsAreRejected()
    {
        using var h = new Harness(); using var owner = h.Client(); await h.Admin(owner, role: ApplicationAdministratorRole.InstallationOwner);
        var (id, client) = await h.Target(); using var target = client;
        var request = await h.Request(owner, id, ApplicationAdministrationService.GrantOwner);
        Assert.Equal(HttpStatusCode.BadRequest, (await TestIdentity.Post(owner, "/api/admin/actions/prepare", request)).StatusCode);
        await h.Enroll(target); request = await h.Request(owner, id, ApplicationAdministrationService.GrantOwner);
        var challenge = await h.Prepare(owner, request);
        (await h.Complete(owner, request, h.Proof(challenge))).EnsureSuccessStatusCode();
        h.Clock.Advance(61); var stale = await h.Request(owner, id, ApplicationAdministrationService.GrantSupport);
        var freshProof = await h.Prepare(owner, stale);
        using (var scope = h.Host.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>(); var grant = await db.ApplicationAdministratorGrants.SingleAsync(x => x.UserId == id);
            grant.Version = Guid.NewGuid().ToString("N"); await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Conflict, (await h.Complete(owner, stale, h.Proof(freshProof))).StatusCode);
        Assert.Equal("Conflict", (await h.Event(stale.OperationId)).Outcome);
        h.Clock.Advance(61); var selfRemoval = await h.Request(owner, h.AdminId, ApplicationAdministrationService.RemoveAdministrator);
        var selfProof = await h.Prepare(owner, selfRemoval);
        (await h.Complete(owner, selfRemoval, h.Proof(selfProof))).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Unauthorized, (await owner.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task FailedGrantNotification_DoesNotUndoOrRepeatCommittedGrant()
    {
        using var h = new Harness(); using var owner = h.Client(); await h.Admin(owner, role: ApplicationAdministratorRole.InstallationOwner);
        var (id, client) = await h.Target(mfa: true); using var target = client;
        h.Sender.FailPurpose = BudgetApp.Application.Email.EmailPurpose.SecurityChange;
        var request = await h.Request(owner, id, ApplicationAdministrationService.GrantSupport);
        var proof = h.Proof(await h.Prepare(owner, request));
        var response = await h.Complete(owner, request, proof); response.EnsureSuccessStatusCode();
        Assert.Equal("SucceededNoticeFailed", (await response.Content.ReadFromJsonAsync<AdministrativeActionResult>())!.Outcome);
        var count = h.Sender.Messages.Count; (await h.Complete(owner, request, proof)).EnsureSuccessStatusCode(); Assert.Equal(count, h.Sender.Messages.Count);
        Assert.Equal("SupportAdministrator", (await owner.GetFromJsonAsync<AdministrativeAccount>($"/api/admin/accounts/{id}"))!.AdministratorRole);
    }

    private static async Task LoginMfa(Harness h, HttpClient client, string email)
    {
        h.Clock.Advance(61);
        var response = await TestIdentity.Post(client, "/api/auth/login", new { email, password = TestIdentity.Password }); response.EnsureSuccessStatusCode();
        var challenge = (await response.Content.ReadFromJsonAsync<Pending>())!.Challenge;
        var proof = h.Proof(challenge);
        (await TestIdentity.Post(client, "/api/auth/verification/login", new { proof.ChallengeId, proof.Code })).EnsureSuccessStatusCode();
    }
}
