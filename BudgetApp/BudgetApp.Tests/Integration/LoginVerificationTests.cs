using System.Net;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using BudgetApp.Application.Authentication;
using BudgetApp.Application.Email;
using BudgetApp.Infrastructure.Data;
using BudgetApp.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace BudgetApp.Tests.Integration;

public sealed class LoginVerificationTests
{
    [Fact]
    public async Task Enrollment_IsOptional_RequiresConfirmedEmailPasswordAndCode_AndRevokesOldSessions()
    {
        using var h = new Harness(); using var client = h.Client(); using var old = h.Client();
        var address = h.Address; await TestIdentity.RegisterAndSignIn(client, address, confirmationHost: h.Host);
        var before = await client.GetFromJsonAsync<User>("/api/auth/me"); Assert.False(before!.LoginVerificationEnabled);
        await h.Login(old);
        var wrongPassword = await h.Post(client, "challenge", new { purpose = "Enable", currentPassword = "incorrect" });
        Assert.Equal(HttpStatusCode.BadRequest, wrongPassword.StatusCode);
        var challenge = await h.Challenge(client, "Enable");
        Assert.False((await client.GetFromJsonAsync<User>("/api/auth/me"))!.LoginVerificationEnabled);
        var enabled = await h.Manage(client, "enable", challenge, h.Code());
        Assert.True(enabled.User.LoginVerificationEnabled); Assert.Equal(10, enabled.RecoveryCodes!.Length);
        Assert.Equal(10, enabled.RecoveryCodes.Distinct().Count()); Assert.Equal(10, enabled.Verification.RecoveryCodesRemaining);
        Assert.Equal(HttpStatusCode.Unauthorized, (await old.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/auth/settings")).StatusCode); // Stamp refresh retains proof.
        Assert.Equal(HttpStatusCode.BadRequest, (await h.ManageResponse(client, "enable", challenge, h.Code())).StatusCode);
        Assert.Contains(h.Sender.Messages, x => x.Purpose == EmailPurpose.SecurityChange);
        using var scope = h.Host.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        var stored = string.Join("\n", await db.UserTokens.Select(x => x.Value).ToListAsync());
        Assert.DoesNotContain(h.Code(), stored);
        foreach (var code in enabled.RecoveryCodes) { Assert.DoesNotContain(code, stored); Assert.DoesNotContain(code.Replace("-", ""), stored); }
        Assert.Equal(0, await db.AuditEvents.CountAsync());
    }

    [Fact]
    public async Task UnconfirmedAccounts_CannotEnroll()
    {
        using var h = new Harness(); using var client = h.Client();
        await TestIdentity.RegisterAndSignIn(client, h.Address);
        Assert.Equal(HttpStatusCode.Forbidden, (await h.Post(client, "challenge", new { purpose = "Enable", currentPassword = TestIdentity.Password })).StatusCode);
    }

    [Fact]
    public async Task PasswordStep_HasNoApplicationAccess_AndCookieIsSecure_CompletionIsSingleUse()
    {
        using var h = new Harness(); using var client = h.Client(); await h.Enroll(client);
        h.Clock.Advance(61);
        var login = await h.Login(client, true); var challenge = (await login.Content.ReadFromJsonAsync<Pending>())!.Challenge;
        var cookies = login.Headers.GetValues("Set-Cookie");
        var cookie = Assert.Single(cookies, x => x.StartsWith("__Host-BudgetApp.Verification=", StringComparison.Ordinal) && !x.StartsWith("__Host-BudgetApp.Verification=;", StringComparison.Ordinal));
        Assert.Contains("secure", cookie); Assert.Contains("httponly", cookie); Assert.Contains("samesite=strict", cookie);
        Assert.DoesNotContain("domain=", cookie); Assert.DoesNotContain("expires=", cookie);
        foreach (var path in new[] { "/api/auth/me", "/api/auth/settings", "/api/households" })
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await TestIdentity.Post(client, "/api/auth/change-password", new { currentPassword = TestIdentity.Password, newPassword = "a new long password" })).StatusCode);
        var pending = (await client.GetFromJsonAsync<Pending>("/api/auth/verification/pending"))!.Challenge;
        Assert.Equal(challenge.ChallengeId, pending.ChallengeId);
        var verified = await h.Verify(client, challenge, h.Code()); verified.EnsureSuccessStatusCode();
        var issued = Assert.Single(verified.Headers.GetValues("Set-Cookie"), x => x.StartsWith("__Host-BudgetApp.Auth=", StringComparison.Ordinal));
        Assert.Contains("expires=", issued); // Remember applies only after both steps.
        Assert.True((await client.GetFromJsonAsync<User>("/api/auth/me"))!.LoginVerificationEnabled);
        Assert.Equal(HttpStatusCode.BadRequest, (await h.Verify(client, challenge, h.Code())).StatusCode);
    }

    [Fact]
    public async Task Resending_IsThrottled_ReplacesCode_AndDoesNotResetFailures()
    {
        using var h = new Harness(); using var client = h.Client(); await h.Enroll(client); h.Clock.Advance(61);
        var challenge = await h.PendingLogin(client); var code = h.Code();
        Assert.Equal((HttpStatusCode)429, (await h.Post(client, "resend-login", new { challenge.ChallengeId })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await h.Verify(client, challenge, "incorrect")).StatusCode);
        h.Clock.Advance(61);
        (await h.Post(client, "resend-login", new { challenge.ChallengeId })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.BadRequest, (await h.Verify(client, challenge, code)).StatusCode);
        for (var i = 0; i < 3; i++) Assert.Equal(HttpStatusCode.BadRequest, (await h.Verify(client, challenge, "incorrect")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await h.Verify(client, challenge, h.Code())).StatusCode);
        h.Clock.Advance(61);
        Assert.Equal(HttpStatusCode.Unauthorized, (await h.Login(client)).StatusCode);
    }

    [Fact]
    public async Task ExpiredCode_CanResend_ButExpiredSessionCannotBeExtended()
    {
        using var h = new Harness(); using var client = h.Client(); await h.Enroll(client); h.Clock.Advance(61);
        var challenge = await h.PendingLogin(client); h.Clock.Advance(301);
        Assert.Equal(HttpStatusCode.BadRequest, (await h.Verify(client, challenge, h.Code())).StatusCode);
        (await h.Post(client, "resend-login", new { challenge.ChallengeId })).EnsureSuccessStatusCode();
        h.Clock.Advance(300);
        Assert.Equal(HttpStatusCode.BadRequest, (await h.Verify(client, challenge, h.Code())).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await h.Post(client, "resend-login", new { challenge.ChallengeId })).StatusCode);
        Assert.Contains("null", await (await client.GetAsync("/api/auth/verification/pending")).Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task NewPasswordAttempts_DoNotResetCodeAttemptBudget()
    {
        using var h = new Harness(); using var client = h.Client(); await h.Enroll(client); h.Clock.Advance(61);
        for (var i = 0; i < 5; i++)
        {
            var challenge = await h.PendingLogin(client);
            Assert.Equal(HttpStatusCode.BadRequest, (await h.Verify(client, challenge, "incorrect")).StatusCode);
            h.Clock.Advance(61);
        }
        Assert.Equal(HttpStatusCode.Unauthorized, (await h.Login(client)).StatusCode);
    }

    [Fact]
    public async Task RecoveryCodes_WorkWhenEmailFails_AreSingleUse_AndDoNotDisableVerification()
    {
        using var h = new Harness(); using var client = h.Client(); var enrollment = await h.Enroll(client);
        h.Sender.Fail = true; h.Clock.Advance(61); var challenge = await h.PendingLogin(client);
        Assert.False(challenge.Delivered);
        // Even the recording sender's failed-delivery code cannot authenticate.
        Assert.Equal(HttpStatusCode.BadRequest, (await h.Verify(client, challenge, h.Code())).StatusCode);
        (await h.Verify(client, challenge, enrollment.RecoveryCodes![0], true)).EnsureSuccessStatusCode();
        Assert.True((await client.GetFromJsonAsync<User>("/api/auth/me"))!.LoginVerificationEnabled);
        h.Clock.Advance(61); var next = await h.PendingLogin(client);
        Assert.Equal(HttpStatusCode.BadRequest, (await h.Verify(client, next, enrollment.RecoveryCodes[0], true)).StatusCode);
        (await h.Verify(client, next, enrollment.RecoveryCodes[1], true)).EnsureSuccessStatusCode();
        var settings = await client.GetFromJsonAsync<Settings>("/api/auth/settings");
        Assert.Equal(8, settings!.Verification.RecoveryCodesRemaining);
    }

    [Fact]
    public async Task FailedEnrollmentDelivery_DoesNotEnableOrAcceptUndeliveredCodes()
    {
        using var h = new Harness(); using var client = h.Client();
        await TestIdentity.RegisterAndSignIn(client, h.Address, confirmationHost: h.Host);
        h.Sender.Fail = true; var challenge = await h.Challenge(client, "Enable");
        Assert.False(challenge.Delivered);
        Assert.Equal(HttpStatusCode.BadRequest, (await h.ManageResponse(client, "enable", challenge, h.Code())).StatusCode);
        Assert.False((await client.GetFromJsonAsync<User>("/api/auth/me"))!.LoginVerificationEnabled);
        h.Sender.Fail = false; h.Clock.Advance(61);
        (await h.Post(client, "resend", new { challenge.ChallengeId, purpose = "Enable" })).EnsureSuccessStatusCode();
        (await h.ManageResponse(client, "enable", challenge, h.Code())).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task RecoveryReplacement_RequiresProof_AndInvalidatesPreviousCodes()
    {
        using var h = new Harness(); using var client = h.Client(); var enrollment = await h.Enroll(client);
        h.Clock.Advance(61); var challenge = await h.Challenge(client, "RecoveryCodes");
        var updated = await h.Manage(client, "recovery-codes", challenge, h.Code());
        Assert.Equal(10, updated.RecoveryCodes!.Length);
        h.Clock.Advance(61); var login = await h.PendingLogin(client);
        Assert.Equal(HttpStatusCode.BadRequest, (await h.Verify(client, login, enrollment.RecoveryCodes![0], true)).StatusCode);
        (await h.Verify(client, login, updated.RecoveryCodes[0], true)).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task DisablingLastMethod_RequiresFreshProof_RemovesCodes_AndRestoresPasswordOnlyLogin()
    {
        using var h = new Harness(); using var client = h.Client(); var enrollment = await h.Enroll(client);
        Assert.Equal(HttpStatusCode.BadRequest, (await h.ManageResponse(client, "disable", new(Guid.NewGuid(), default, default, default, true), "incorrect")).StatusCode);
        h.Clock.Advance(61); var challenge = await h.Challenge(client, "Disable");
        var result = await h.Manage(client, "disable", challenge, enrollment.RecoveryCodes![0], true);
        Assert.False(result.User.LoginVerificationEnabled); Assert.Equal(0, result.Verification.RecoveryCodesRemaining);
        var login = await h.Login(client); login.EnsureSuccessStatusCode();
        Assert.False((await login.Content.ReadFromJsonAsync<User>())!.LoginVerificationEnabled);
    }

    [Fact]
    public async Task Challenge_IsBoundToUserPurposeAndCookie_CancelPreventsCompletion()
    {
        using var h = new Harness(); using var client = h.Client(); await h.Enroll(client); h.Clock.Advance(61);
        var security = await h.Challenge(client, "Disable");
        Assert.Equal(HttpStatusCode.BadRequest, (await h.ManageResponse(client, "recovery-codes", security, h.Code())).StatusCode);
        using var other = h.Client(); await TestIdentity.RegisterAndSignIn(other, "other-" + h.Address, confirmationHost: h.Host);
        Assert.Equal(HttpStatusCode.BadRequest, (await h.ManageResponse(other, "enable", security, h.Code())).StatusCode);
        h.Clock.Advance(61); var challenge = await h.PendingLogin(client);
        using var attacker = h.Client(); Assert.Equal(HttpStatusCode.BadRequest, (await h.Verify(attacker, challenge, h.Code())).StatusCode);
        (await h.Post(client, "cancel-login", new { })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.BadRequest, (await h.Verify(client, challenge, h.Code())).StatusCode);
        using var scope = h.Host.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        Assert.False(await db.UserTokens.AnyAsync(x => x.LoginProvider == "BudgetApp.LoginVerification" && x.Name == "Login"));
    }

    [Fact]
    public async Task SensitiveChanges_RequireTheirOwnProof_AndEmailReplacementPreservesVerification()
    {
        using var h = new Harness(); using var client = h.Client(); await h.Enroll(client);
        var changePassword = new { currentPassword = TestIdentity.Password, newPassword = "a different long password" };
        Assert.Equal(HttpStatusCode.BadRequest, (await TestIdentity.Post(client, "/api/auth/change-password", changePassword)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await TestIdentity.Post(client, "/api/auth/request-email-change", new { newEmail = "new-" + h.Address, currentPassword = TestIdentity.Password })).StatusCode);
        h.Clock.Advance(61); var challenge = await h.Challenge(client, "ChangeEmail");
        var proof = new VerificationProof(challenge.ChallengeId, h.Code());
        (await TestIdentity.Post(client, "/api/auth/request-email-change", new { newEmail = "new-" + h.Address, currentPassword = TestIdentity.Password, proof })).EnsureSuccessStatusCode();
        var link = TestIdentity.LinkParameters(h.Sender.Messages.Last(x => x.Purpose == EmailPurpose.EmailChange).PlainTextBody);
        var before = (await client.GetFromJsonAsync<User>("/api/auth/me"))!;
        (await TestIdentity.Post(client, "/api/auth/confirm-email-change", new { userId = before.Id, token = link["token"] })).EnsureSuccessStatusCode();
        var after = (await client.GetFromJsonAsync<User>("/api/auth/me"))!;
        Assert.Equal("new-" + h.Address, after.Email); Assert.True(after.LoginVerificationEnabled);
        h.Clock.Advance(61); var login = await h.PendingLogin(client, after.Email);
        Assert.Equal(after.Email, h.Sender.Messages.Last(x => x.Purpose == EmailPurpose.LoginVerification).RecipientAddress);
        (await h.Verify(client, login, h.Code())).EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task PasswordChangeAndPasswordReset_DoNotDisableOrBypassVerification()
    {
        using var h = new Harness(); using var client = h.Client(); await h.Enroll(client); h.Clock.Advance(61);
        var challenge = await h.Challenge(client, "ChangePassword"); var proof = new VerificationProof(challenge.ChallengeId, h.Code());
        (await TestIdentity.Post(client, "/api/auth/change-password", new { currentPassword = TestIdentity.Password, newPassword = "a different long password", proof })).EnsureSuccessStatusCode();
        Assert.True((await client.GetFromJsonAsync<User>("/api/auth/me"))!.LoginVerificationEnabled);
        (await TestIdentity.Post(client, "/api/auth/forgot-password", new { email = h.Address })).EnsureSuccessStatusCode();
        var link = TestIdentity.LinkParameters(h.Sender.Messages.Last(x => x.Purpose == EmailPurpose.PasswordRecovery).PlainTextBody);
        (await TestIdentity.Post(client, "/api/auth/reset-password", new { userId = Guid.Parse(link["userId"]), token = link["token"], newPassword = TestIdentity.Password })).EnsureSuccessStatusCode();
        h.Clock.Advance(61); await h.PendingLogin(client);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task SecurityChanges_InvalidateOlderPendingChallenges_AndRequireCsrf()
    {
        using var h = new Harness(); using var client = h.Client(); var enrollment = await h.Enroll(client);
        using var pending = h.Client(); h.Clock.Advance(61); var login = await h.PendingLogin(pending);
        var code = h.Code();
        Assert.Equal(HttpStatusCode.BadRequest, (await pending.PostAsJsonAsync("/api/auth/verification/login", new { login.ChallengeId, code })).StatusCode);
        h.Clock.Advance(61); var disable = await h.Challenge(client, "Disable");
        await h.Manage(client, "disable", disable, enrollment.RecoveryCodes![0], true);
        Assert.Equal(HttpStatusCode.BadRequest, (await h.Verify(pending, login, code)).StatusCode);
    }

    private sealed class Harness : IDisposable
    {
        private readonly BudgetAppWebApplicationFactory root = new();
        public readonly TestClock Clock = new();
        public readonly TestSender Sender = new();
        public readonly string Address = $"verification-{Guid.NewGuid():N}@example.test";
        public WebApplicationFactory<Program> Host { get; }
        public Harness()
        {
            Host = root.WithWebHostBuilder(builder => builder.ConfigureTestServices(services => {
                services.RemoveAll<TimeProvider>(); services.AddSingleton<TimeProvider>(Clock);
                services.RemoveAll<IEmailSender>(); services.AddSingleton<IEmailSender>(Sender);
                // TestIdentity's confirmation helper reads the recording sender.
                services.RemoveAll<RecordingEmailSender>(); services.AddSingleton(Sender.Recording);
            }));
            using var scope = Host.Services.CreateScope(); scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>().Database.EnsureCreated();
        }
        public HttpClient Client() => Host.CreateClient(new() { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });
        public Task<HttpResponseMessage> Post(HttpClient client, string suffix, object body) => TestIdentity.Post(client, "/api/auth/verification/" + suffix, body);
        public Task<HttpResponseMessage> Login(HttpClient client, bool rememberMe = false, string? address = null) =>
            TestIdentity.Post(client, "/api/auth/login", new { email = address ?? Address, password = TestIdentity.Password, rememberMe });
        public async Task<VerificationChallenge> PendingLogin(HttpClient client, string? address = null)
        { var response = await Login(client, address: address); response.EnsureSuccessStatusCode(); return (await response.Content.ReadFromJsonAsync<Pending>())!.Challenge; }
        public async Task<VerificationChallenge> Challenge(HttpClient client, string purpose)
        { var response = await Post(client, "challenge", new { purpose, currentPassword = TestIdentity.Password }); response.EnsureSuccessStatusCode(); return (await response.Content.ReadFromJsonAsync<VerificationChallenge>())!; }
        public string Code() => Regex.Match(Sender.Messages.Last(x => x.Purpose == EmailPurpose.LoginVerification).PlainTextBody, @"^\d{8}$", RegexOptions.Multiline).Value;
        public Task<HttpResponseMessage> Verify(HttpClient client, VerificationChallenge challenge, string code, bool recovery = false) =>
            Post(client, "login", new { challenge.ChallengeId, code, useRecoveryCode = recovery });
        public Task<HttpResponseMessage> ManageResponse(HttpClient client, string action, VerificationChallenge challenge, string code, bool recovery = false) =>
            Post(client, action, new { currentPassword = TestIdentity.Password, proof = new VerificationProof(challenge.ChallengeId, code, recovery) });
        public async Task<Managed> Manage(HttpClient client, string action, VerificationChallenge challenge, string code, bool recovery = false)
        { var response = await ManageResponse(client, action, challenge, code, recovery); response.EnsureSuccessStatusCode(); return (await response.Content.ReadFromJsonAsync<Managed>())!; }
        public async Task<Managed> Enroll(HttpClient client)
        { await TestIdentity.RegisterAndSignIn(client, Address, confirmationHost: Host); var challenge = await Challenge(client, "Enable"); return await Manage(client, "enable", challenge, Code()); }
        public void Dispose() { Host.Dispose(); root.Dispose(); }
    }
    private sealed class TestClock : TimeProvider
    { private DateTimeOffset now = DateTimeOffset.UtcNow; public override DateTimeOffset GetUtcNow() => now; public void Advance(int seconds) => now += TimeSpan.FromSeconds(seconds); }
    private sealed class TestSender : IEmailSender
    {
        public RecordingEmailSender Recording { get; } = new();
        public IReadOnlyList<EmailMessage> Messages => Recording.Messages;
        public bool Fail { get; set; }
        public async Task SendAsync(EmailMessage message, CancellationToken ct = default)
        { await Recording.SendAsync(message, ct); if (Fail) throw new EmailDeliveryException("Test delivery failure"); }
    }
    private sealed record User(Guid Id, string Email, bool LoginVerificationEnabled);
    private sealed record Pending(VerificationChallenge Challenge);
    private sealed record Managed(User User, string[]? RecoveryCodes, LoginVerificationStatus Verification);
    private sealed record Settings(LoginVerificationStatus Verification);
}
