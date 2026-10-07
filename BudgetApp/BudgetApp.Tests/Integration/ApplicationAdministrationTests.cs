using System.Net;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using BudgetApp.Application.Authentication;
using BudgetApp.Application.Email;
using BudgetApp.Infrastructure.Administration;
using BudgetApp.Infrastructure.Data;
using BudgetApp.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace BudgetApp.Tests.Integration;

public sealed partial class ApplicationAdministrationTests
{
    [Fact]
    public async Task HouseholdOwnerIsNotAnOperator_AndOperatorCannotBrowseHouseholdFinancialData()
    {
        using var h = new Harness(); using var admin = h.Client(); await h.Admin(admin);
        var (id, client) = await h.Target(); using var target = client;
        var created = await TestIdentity.Post(target, "/api/households", new { name = "Private household", defaultCurrency = "CAD", timeZoneId = "UTC" }); created.EnsureSuccessStatusCode();
        var household = (await created.Content.ReadFromJsonAsync<IdResponse>())!.Id;
        (await TestIdentity.Post(target, $"/api/households/{household}/accounts", new { name = "Private checking", type = "Chequing", scope = "Household", currency = "CAD" })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Forbidden, (await target.GetAsync("/api/admin/accounts?search=operator")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.GetAsync($"/api/households/{household}/accounts")).StatusCode);
        using var beforeScope = h.Host.Services.CreateScope(); var db = beforeScope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        var activityCount = await db.AuditEvents.CountAsync();
        var request = await h.Request(admin, id, ApplicationAdministrationService.RevokeSessions);
        var challenge = await h.Prepare(admin, request); (await h.Complete(admin, request, h.Proof(challenge))).EnsureSuccessStatusCode();
        Assert.Equal("Private checking", (await db.Accounts.AsNoTracking().SingleAsync()).Name);
        Assert.Equal(activityCount, await db.AuditEvents.CountAsync());
    }
    [Fact]
    public async Task EveryOperatorEndpoint_DeniesOrdinaryAndPasswordOnlyUsers_AndAnonymousRequests()
    {
        using var h = new Harness(); using var admin = h.Client(); using var anonymous = h.Client();
        await h.Admin(admin, enroll: false); var (id, ordinary) = await h.Target(); using var target = ordinary;
        foreach (var path in new[] { "/api/admin/users", "/api/admin/accounts?search=target", $"/api/admin/accounts/{id}", "/api/admin/audit", $"/api/admin/actions/{Guid.NewGuid()}" })
        {
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(path)).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await target.GetAsync(path)).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await admin.GetAsync(path)).StatusCode);
        }
        foreach (var path in new[] { "prepare", "resend", "complete" })
            Assert.Equal(HttpStatusCode.Forbidden, (await TestIdentity.Post(target, "/api/admin/actions/" + path, new { })).StatusCode);
        var me = await admin.GetFromJsonAsync<Me>("/api/auth/me"); Assert.True(me!.IsApplicationAdministrator);
        Assert.Equal(0, await h.AuditCount());
    }
    [Fact]
    public async Task GrantedMfaOperator_CanSearchWithoutHousehold_OnlyGetsAccountMetadata()
    {
        using var h = new Harness(); using var admin = h.Client(); await h.Admin(admin);
        var (id, client) = await h.Target(); using var target = client;
        var body = await admin.GetStringAsync("/api/admin/accounts?search=target");
        Assert.Contains(id.ToString(), body); Assert.DoesNotContain("passwordHash", body); Assert.DoesNotContain("securityStamp", body);
        Assert.DoesNotContain("recoveryCodes", body); Assert.DoesNotContain("transactions", body);
        Assert.Empty((await admin.GetFromJsonAsync<Search>("/api/admin/accounts"))!.Items);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.GetAsync("/api/admin/accounts?search=x")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync("/api/admin/audit")).StatusCode);
    }
    [Fact]
    public async Task Approval_IsBoundToAccountActionReasonAndOperation_AndCannotUseGeneralChallengeEndpoint()
    {
        using var h = new Harness(); using var admin = h.Client(); await h.Admin(admin);
        var (id, client) = await h.Target(); using var target = client;
        var request = await h.Request(admin, id, ApplicationAdministrationService.RevokeSessions);
        var challenge = await h.Prepare(admin, request); var proof = h.Proof(challenge);
        Assert.Equal(HttpStatusCode.BadRequest, (await TestIdentity.Post(admin, "/api/auth/verification/challenge",
            new { purpose = "Administration", currentPassword = TestIdentity.Password })).StatusCode);
        var altered = request with { Reason = "A different support reason" };
        Assert.Equal(HttpStatusCode.BadRequest, (await h.Complete(admin, altered, proof)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await target.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(1, await h.AuditCount());
        Assert.Equal("VerificationFailed", (await h.Event(request.OperationId)).Outcome);
    }
    [Fact]
    public async Task RevokeSessions_IsImmediateAuditedAndIdempotent_WithoutChangingMfaOrFinancialRecords()
    {
        using var h = new Harness(); using var admin = h.Client(); await h.Admin(admin);
        var (id, client) = await h.Target(mfa: true); using var target = client;
        var request = await h.Request(admin, id, ApplicationAdministrationService.RevokeSessions);
        var challenge = await h.Prepare(admin, request); var proof = h.Proof(challenge);
        var response = await h.Complete(admin, request, proof); response.EnsureSuccessStatusCode();
        Assert.Equal("Succeeded", (await response.Content.ReadFromJsonAsync<AdministrativeActionResult>())!.Outcome);
        Assert.Equal(HttpStatusCode.Unauthorized, (await target.GetAsync("/api/auth/me")).StatusCode);
        var before = h.Sender.Messages.Count;
        (await h.Complete(admin, request, proof)).EnsureSuccessStatusCode();
        Assert.Equal(before, h.Sender.Messages.Count); Assert.Equal(1, await h.AuditCount());
        using var scope = h.Host.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        Assert.True((await db.Users.SingleAsync(x => x.Id == id)).TwoFactorEnabled);
        Assert.Equal(0, await db.AuditEvents.CountAsync()); Assert.Equal(0, await db.Transactions.CountAsync());
        Assert.Equal(HttpStatusCode.Unauthorized, (await TestIdentity.Post(target, "/api/admin/actions/complete", new { request, proof })).StatusCode);
    }
    [Fact]
    public async Task PasswordReset_SendsExistingFlowToVerifiedAddress_AndDoesNotDisableMfa()
    {
        using var h = new Harness(); using var admin = h.Client(); await h.Admin(admin);
        var (id, client) = await h.Target(mfa: true); using var target = client;
        var request = await h.Request(admin, id, ApplicationAdministrationService.PasswordReset);
        var challenge = await h.Prepare(admin, request);
        (await h.Complete(admin, request, h.Proof(challenge))).EnsureSuccessStatusCode();
        var mail = h.Sender.Messages.Last(x => x.Purpose == EmailPurpose.PasswordRecovery);
        Assert.Equal(h.TargetEmail, mail.RecipientAddress);
        var link = TestIdentity.LinkParameters(mail.PlainTextBody);
        (await TestIdentity.Post(target, "/api/auth/reset-password", new { userId = id, token = link["token"], newPassword = "a replacement test password" })).EnsureSuccessStatusCode();
        using var scope = h.Host.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        var user = await db.Users.SingleAsync(x => x.Id == id); Assert.True(user.TwoFactorEnabled); Assert.Equal(h.TargetEmail, user.Email);
        Assert.Equal("EmailSent", (await h.Event(request.OperationId)).Outcome);
    }
    [Fact]
    public async Task MfaRecovery_NeedsDeliveredEmailAndPassword_KeepsMfaOn_RevokesSessionsAndReturnsCodesOnce()
    {
        using var h = new Harness(); using var admin = h.Client(); await h.Admin(admin);
        var (id, client) = await h.Target(mfa: true); using var target = client;
        var request = await h.Request(admin, id, ApplicationAdministrationService.MfaRecovery);
        var challenge = await h.Prepare(admin, request);
        (await h.Complete(admin, request, h.Proof(challenge))).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.OK, (await target.GetAsync("/api/auth/me")).StatusCode); // Sending isn't resetting.
        var link = h.RecoveryLink(); using var recovering = h.Client();
        Assert.Equal(HttpStatusCode.BadRequest, (await h.Recover(recovering, id, link["token"], "wrong password")).StatusCode);
        var response = await h.Recover(recovering, id, link["token"]); response.EnsureSuccessStatusCode();
        var codes = (await response.Content.ReadFromJsonAsync<Codes>())!.RecoveryCodes;
        Assert.Equal(10, codes.Length); Assert.All(codes, c => Assert.Matches("^[0-9A-F]{8}(-[0-9A-F]{8}){3}$", c));
        Assert.Equal(HttpStatusCode.Unauthorized, (await recovering.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await target.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await h.Recover(recovering, id, link["token"])).StatusCode);
        using var scope = h.Host.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        var user = await db.Users.SingleAsync(x => x.Id == id); Assert.True(user.TwoFactorEnabled); Assert.Equal(h.TargetEmail, user.Email);
        var stored = string.Join('\n', await db.UserTokens.Select(x => x.Value).ToListAsync());
        Assert.DoesNotContain(link["token"], stored); foreach (var code in codes) Assert.DoesNotContain(code.Replace("-", ""), stored);
        Assert.Equal(2, await h.AuditCount()); Assert.Equal(0, await db.AuditEvents.CountAsync());
        h.Clock.Advance(61);
        var login = await TestIdentity.Post(recovering, "/api/auth/login", new { email = h.TargetEmail, password = TestIdentity.Password });
        var pending = (await login.Content.ReadFromJsonAsync<Pending>())!.Challenge;
        var verified = await TestIdentity.Post(recovering, "/api/auth/verification/login", new { pending.ChallengeId, code = codes[0], useRecoveryCode = true });
        verified.EnsureSuccessStatusCode();
    }
    [Theory]
    [InlineData("expired")]
    [InlineData("changedEmail")]
    [InlineData("removedOperator")]
    [InlineData("revokedOperatorSession")]
    [InlineData("operatorMfaDisabled")]
    [InlineData("changedPassword")]
    public async Task RecoveryCannotBypassExpiryEmailOrOperatorRevocation(string change)
    {
        using var h = new Harness(); using var admin = h.Client(); await h.Admin(admin);
        var (id, client) = await h.Target(mfa: true); using var target = client;
        var request = await h.Request(admin, id, ApplicationAdministrationService.MfaRecovery);
        var challenge = await h.Prepare(admin, request);
        (await h.Complete(admin, request, h.Proof(challenge))).EnsureSuccessStatusCode(); var token = h.RecoveryLink()["token"];
        if (change == "expired") h.Clock.Advance(901);
        else if (change == "removedOperator")
        {
            using var scope = h.Host.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
            db.ApplicationAdministratorGrants.Remove(await db.ApplicationAdministratorGrants.SingleAsync()); await db.SaveChangesAsync();
        }
        else
        {
            using var scope = h.Host.Services.CreateScope(); var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var user = (await users.FindByIdAsync((change is "changedEmail" or "changedPassword" ? id : h.AdminId).ToString()))!;
            if (change == "changedEmail") { user.Email = "changed@example.test"; user.NormalizedEmail = "CHANGED@EXAMPLE.TEST"; await users.UpdateAsync(user); }
            else if (change == "operatorMfaDisabled") await users.SetTwoFactorEnabledAsync(user, false);
            else if (change == "changedPassword") Assert.True((await users.ChangePasswordAsync(user, TestIdentity.Password, "a replacement long password")).Succeeded);
            else await users.UpdateSecurityStampAsync(user);
        }
        Assert.Equal(HttpStatusCode.BadRequest, (await h.Recover(target, id, token)).StatusCode);
        Assert.Equal(1, await h.AuditCount());
    }
    [Fact]
    public async Task ReplacementLinkInvalidatesPreviousLink_AndRecoveryRequiresCsrf()
    {
        using var h = new Harness(); using var admin = h.Client(); await h.Admin(admin);
        var (id, client) = await h.Target(mfa: true); using var target = client;
        var request = await h.Request(admin, id, ApplicationAdministrationService.MfaRecovery);
        var challenge = await h.Prepare(admin, request);
        (await h.Complete(admin, request, h.Proof(challenge))).EnsureSuccessStatusCode(); var old = h.RecoveryLink()["token"];
        h.Clock.Advance(61);
        var next = await h.Request(admin, id, ApplicationAdministrationService.MfaRecovery);
        var fresh = await h.Prepare(admin, next);
        (await h.Complete(admin, next, h.Proof(fresh))).EnsureSuccessStatusCode(); var current = h.RecoveryLink()["token"];
        Assert.NotEqual(old, current);
        Assert.Equal(HttpStatusCode.BadRequest, (await h.Recover(target, id, old)).StatusCode);
        Assert.False((await target.PostAsJsonAsync("/api/auth/operator-mfa-recovery", new { userId = id, token = current, currentPassword = TestIdentity.Password })).IsSuccessStatusCode);
        Assert.Equal(HttpStatusCode.OK, (await target.GetAsync("/api/auth/me")).StatusCode);
        (await h.Recover(target, id, current)).EnsureSuccessStatusCode();
    }
    [Fact]
    public async Task FailedDelivery_IsAuditedAndCannotBeUsedOrAutomaticallyResent()
    {
        using var h = new Harness(); using var admin = h.Client(); await h.Admin(admin);
        var (id, client) = await h.Target(mfa: true); using var target = client;
        h.Sender.FailPurpose = EmailPurpose.OperatorMfaRecovery;
        var request = await h.Request(admin, id, ApplicationAdministrationService.MfaRecovery);
        var challenge = await h.Prepare(admin, request); var proof = h.Proof(challenge);
        var response = await h.Complete(admin, request, proof); response.EnsureSuccessStatusCode();
        Assert.Equal("DeliveryFailed", (await response.Content.ReadFromJsonAsync<AdministrativeActionResult>())!.Outcome);
        var count = h.Sender.Messages.Count; (await h.Complete(admin, request, proof)).EnsureSuccessStatusCode();
        Assert.Equal(count, h.Sender.Messages.Count);
        Assert.Equal(HttpStatusCode.BadRequest, (await h.Recover(target, id, h.RecoveryLink()["token"])).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await target.GetAsync("/api/auth/me")).StatusCode);
    }
    [Fact]
    public async Task SelfAdministratorTargetsStaleVersionsAndMissingCsrf_AreRejected()
    {
        using var h = new Harness(); using var admin = h.Client(); await h.Admin(admin);
        var own = await h.Request(admin, h.AdminId, ApplicationAdministrationService.RevokeSessions);
        Assert.Equal(HttpStatusCode.Forbidden, (await TestIdentity.Post(admin, "/api/admin/actions/prepare", own)).StatusCode);
        var (id, client) = await h.Target(); using var target = client;
        var request = await h.Request(admin, id, ApplicationAdministrationService.RevokeSessions);
        Assert.Equal(HttpStatusCode.Conflict, (await TestIdentity.Post(admin, "/api/admin/actions/prepare", request with { Version = "stale" })).StatusCode);
        Assert.False((await admin.PostAsJsonAsync("/api/admin/actions/prepare", request)).IsSuccessStatusCode);
        Assert.Equal(0, await h.AuditCount());
    }
    private sealed class Harness : IDisposable
    {
        private readonly BudgetAppWebApplicationFactory root = new();
        public readonly Guid AdminId = Guid.NewGuid(); public readonly TestClock Clock = new(); public readonly TestSender Sender = new();
        public string TargetEmail { get; } = $"target-{Guid.NewGuid():N}@example.test";
        public WebApplicationFactory<Program> Host { get; }
        public Harness()
        {
            Host = root.WithWebHostBuilder(b => {
                b.ConfigureTestServices(s => { s.RemoveAll<TimeProvider>(); s.AddSingleton<TimeProvider>(Clock);
                    s.RemoveAll<IEmailSender>(); s.AddSingleton<IEmailSender>(Sender); }); });
            using var scope = Host.Services.CreateScope(); scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>().Database.EnsureCreated();
        }
        public HttpClient Client() => Host.CreateClient(new() { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });
        public async Task Seed(Guid id, string address)
        { using var scope = Host.Services.CreateScope(); var manager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
          var result = await manager.CreateAsync(new() { Id = id, Email = address, UserName = address, EmailConfirmed = true, DisplayName = "Test account" }, TestIdentity.Password); Assert.True(result.Succeeded); }
        public async Task Admin(HttpClient client, bool enroll = true, ApplicationAdministratorRole role = ApplicationAdministratorRole.SupportAdministrator)
        {
            await Seed(AdminId, "operator@example.test");
            using (var scope = Host.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
                db.ApplicationAdministratorGrants.Add(new() { UserId = AdminId, Role = role });
                (await db.ApplicationAdministrationStates.SingleAsync()).BootstrapCompleted = true; await db.SaveChangesAsync();
            }
            (await TestIdentity.Post(client, "/api/auth/login", new { email = "operator@example.test", password = TestIdentity.Password })).EnsureSuccessStatusCode(); if (enroll) await Enroll(client);
        }
        public async Task<(Guid, HttpClient)> Target(bool mfa = false)
        { var id = Guid.NewGuid(); await Seed(id, TargetEmail); var client = Client(); (await TestIdentity.Post(client, "/api/auth/login", new { email = TargetEmail, password = TestIdentity.Password })).EnsureSuccessStatusCode();
          if (mfa) await Enroll(client); return (id, client); }
        public async Task Enroll(HttpClient client)
        { var response = await TestIdentity.Post(client, "/api/auth/verification/challenge", new { purpose = "Enable", currentPassword = TestIdentity.Password }); response.EnsureSuccessStatusCode();
          var challenge = (await response.Content.ReadFromJsonAsync<VerificationChallenge>())!;
          (await TestIdentity.Post(client, "/api/auth/verification/enable", new { currentPassword = TestIdentity.Password, proof = Proof(challenge) })).EnsureSuccessStatusCode(); Clock.Advance(61); }
        public VerificationProof Proof(VerificationChallenge c) => new(c.ChallengeId, Regex.Match(Sender.Messages.Last(x => x.Purpose == EmailPurpose.LoginVerification).PlainTextBody, @"^\d{6}$", RegexOptions.Multiline).Value);
        public async Task<AdministrativeActionRequest> Request(HttpClient client, Guid id, string action)
        {
            var account = (await client.GetFromJsonAsync<AdministrativeAccount>($"/api/admin/accounts/{id}"))!;
            return new(Guid.NewGuid(), id, action, "User requested support for test case.", account.Version, TestIdentity.Password, account.AdministratorVersion);
        }
        public async Task<VerificationChallenge> Prepare(HttpClient client, AdministrativeActionRequest request)
        { var result = await TestIdentity.Post(client, "/api/admin/actions/prepare", request); result.EnsureSuccessStatusCode(); return (await result.Content.ReadFromJsonAsync<VerificationChallenge>())!; }
        public Task<HttpResponseMessage> Complete(HttpClient client, AdministrativeActionRequest request, VerificationProof proof) => TestIdentity.Post(client, "/api/admin/actions/complete", new { request, proof });
        public Dictionary<string, string> RecoveryLink() => TestIdentity.LinkParameters(Sender.Messages.Last(x => x.Purpose == EmailPurpose.OperatorMfaRecovery).PlainTextBody);
        public Task<HttpResponseMessage> Recover(HttpClient client, Guid id, string token, string password = TestIdentity.Password) =>
            TestIdentity.Post(client, "/api/auth/operator-mfa-recovery", new { userId = id, token, currentPassword = password });
        public async Task<int> AuditCount() { using var scope = Host.Services.CreateScope(); return await scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>().AdministrativeAuditEvents.CountAsync(); }
        public async Task<AdministrativeAuditEvent> Event(Guid id) { using var scope = Host.Services.CreateScope(); return await scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>().AdministrativeAuditEvents.AsNoTracking().SingleAsync(x => x.Id == id); }
        public void Dispose() { Host.Dispose(); root.Dispose(); }
    }
    private sealed class TestClock : TimeProvider { private DateTimeOffset now = DateTimeOffset.UtcNow; public override DateTimeOffset GetUtcNow() => now; public void Advance(int seconds) => now += TimeSpan.FromSeconds(seconds); }
    private sealed class TestSender : IEmailSender
    { public List<EmailMessage> Messages { get; } = []; public EmailPurpose? FailPurpose { get; set; }
      public Task SendAsync(EmailMessage message, CancellationToken ct = default) { Messages.Add(message); if (message.Purpose == FailPurpose) throw new EmailDeliveryException("Isolated failure"); return Task.CompletedTask; } }
    private sealed record Me(bool IsApplicationAdministrator);
    private sealed record IdResponse(Guid Id);
    private sealed record Search(AdministrativeAccount[] Items);
    private sealed record Pending(VerificationChallenge Challenge);
    private sealed record Codes(string[] RecoveryCodes);
}
