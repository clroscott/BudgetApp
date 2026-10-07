using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using BudgetApp.Application.Email;
using BudgetApp.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace BudgetApp.Tests.Integration;

public sealed class AccountSettingsTests(BudgetAppWebApplicationFactory factory) : IClassFixture<BudgetAppWebApplicationFactory>
{
    [Fact]
    public async Task SettingsAndProfile_RequireAuthentication()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/settings")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Put(client, new { displayName = "Private", version = "version" })).StatusCode);
    }

    [Fact]
    public async Task UnverifiedAccountWithoutHousehold_CanReadAndEditOnlyItsOwnAccount()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var address = Address();
        var userId = await TestIdentity.RegisterAndSignIn(client, address);
        var original = await Settings(client);
        Assert.Equal(userId, original.User.Id);
        Assert.Equal(address, original.User.Email);
        Assert.False(original.User.EmailConfirmed);
        Assert.Null(original.PendingEmailChange);
        var saved = await Put(client, new { displayName = "  My new name  ", version = original.Version });
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        var updated = (await saved.Content.ReadFromJsonAsync<SettingsResponse>())!;
        Assert.Equal("My new name", updated.User.DisplayName);
        Assert.NotEqual(original.Version, updated.Version);
        Assert.Equal(original.User.Id, updated.User.Id);
        Assert.Equal(original.User.Email, updated.User.Email);
        Assert.False(updated.User.EmailConfirmed);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/households")).StatusCode);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        Assert.False(await db.HouseholdMembers.AnyAsync(item => item.UserId == userId));
    }

    [Fact]
    public async Task AccountEndpoints_DoNotAcceptAnotherUsersIdentityFromQueryOrBody()
    {
        using var first = factory.CreateAuthenticatedTestClient();
        using var other = factory.CreateAuthenticatedTestClient();
        var firstId = await TestIdentity.RegisterAndSignIn(first);
        var otherId = await TestIdentity.RegisterAndSignIn(other, displayName: "Other private user");
        var before = (await first.GetFromJsonAsync<SettingsResponse>($"/api/auth/settings?userId={otherId}"))!;
        Assert.Equal(firstId, before.User.Id);
        (await Put(first, new { userId = otherId, displayName = "Only my name", version = before.Version })).EnsureSuccessStatusCode();
        Assert.Equal("Other private user", (await Settings(other)).User.DisplayName);
        Assert.Equal("Only my name", (await Settings(first)).User.DisplayName);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Profile_RejectsBlankNames(string name)
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await TestIdentity.RegisterAndSignIn(client);
        var before = await Settings(client);
        Assert.Equal(HttpStatusCode.BadRequest, (await Put(client, new { displayName = name, version = before.Version })).StatusCode);
        Assert.Equal(before.User.DisplayName, (await Settings(client)).User.DisplayName);
    }

    [Fact]
    public async Task Profile_RequiresCsrfAndValidLengthsAndVersion()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await TestIdentity.RegisterAndSignIn(client);
        var before = await Settings(client);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/auth/profile",
            new { displayName = "Changed", version = before.Version })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Put(client, new { displayName = new string('x', 101), version = before.Version })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Put(client, new { displayName = "Changed" })).StatusCode);
        Assert.Equal(before.User.DisplayName, (await Settings(client)).User.DisplayName);
    }

    [Fact]
    public async Task Profile_RejectsStaleEditsWithoutOverwritingASeparateSave()
    {
        using var first = factory.CreateAuthenticatedTestClient();
        using var second = factory.CreateAuthenticatedTestClient();
        var address = Address();
        await TestIdentity.RegisterAndSignIn(first, address);
        await SignIn(second, address);
        var original = await Settings(first);
        (await Put(second, new { displayName = "Saved in other tab", version = original.Version })).EnsureSuccessStatusCode();
        var conflict = await Put(first, new { displayName = "Must not overwrite", version = original.Version });
        Assert.Equal(HttpStatusCode.Conflict, conflict.StatusCode);
        Assert.Contains("reload", await conflict.Content.ReadAsStringAsync());
        Assert.Equal("Saved in other tab", (await Settings(first)).User.DisplayName);
    }

    [Fact]
    public async Task PendingEmail_IsPrivateKeepsCurrentAddressAndClearsAfterConfirmation()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        using var other = factory.CreateAuthenticatedTestClient();
        var original = Address();
        var replacement = Address();
        var userId = await TestIdentity.RegisterAndSignIn(client, original, confirmationHost: factory);
        await TestIdentity.RegisterAndSignIn(other);
        (await TestIdentity.Post(client, "/api/auth/request-email-change", new { newEmail = replacement, currentPassword = TestIdentity.Password })).EnsureSuccessStatusCode();
        var pending = await Settings(client);
        Assert.Equal(original, pending.User.Email);
        Assert.True(pending.User.EmailConfirmed);
        Assert.Equal(replacement, pending.PendingEmailChange!.Email);
        Assert.False(pending.PendingEmailChange.IsExpired);
        Assert.InRange((pending.PendingEmailChange.ExpiresAtUtc - pending.PendingEmailChange.RequestedAtUtc).TotalMinutes, 59.9, 60.1);
        var otherResponse = await other.GetAsync($"/api/auth/settings?userId={userId}");
        Assert.DoesNotContain(replacement, await otherResponse.Content.ReadAsStringAsync());
        Assert.Null((await Settings(other)).PendingEmailChange);
        var message = Messages(replacement, EmailPurpose.EmailChange).Single();
        var proof = TestIdentity.LinkParameters(message.PlainTextBody);
        (await TestIdentity.Post(client, "/api/auth/confirm-email-change", new { userId, token = proof["token"] })).EnsureSuccessStatusCode();
        var confirmed = await Settings(client);
        Assert.Equal(replacement, confirmed.User.Email);
        Assert.Null(confirmed.PendingEmailChange);
        Assert.Equal(userId, confirmed.User.Id);
    }

    [Fact]
    public async Task PendingEmail_DoesNotDiscloseEligibilityOrProofMaterial()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        using var other = factory.CreateAuthenticatedTestClient();
        var claimed = Address();
        await TestIdentity.RegisterAndSignIn(client);
        await TestIdentity.RegisterAndSignIn(other, claimed);
        var response = await TestIdentity.Post(client, "/api/auth/request-email-change", new { newEmail = claimed, currentPassword = TestIdentity.Password });
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        Assert.Empty(Messages(claimed, EmailPurpose.EmailChange));
        var body = await (await client.GetAsync("/api/auth/settings")).Content.ReadAsStringAsync();
        using var json = JsonDocument.Parse(body);
        var pending = json.RootElement.GetProperty("pendingEmailChange");
        Assert.Equal(claimed, pending.GetProperty("email").GetString());
        Assert.Equal(new[] { "email", "expiresAtUtc", "isExpired", "requestedAtUtc" }, pending.EnumerateObject().Select(item => item.Name).Order().ToArray());
        Assert.False(pending.GetProperty("isExpired").GetBoolean());
    }

    [Fact]
    public async Task PendingEmail_ExposesExpiryWithoutChangingTheCurrentEmail()
    {
        using var initialize = factory.CreateAuthenticatedTestClient();
        var clock = new TestClock();
        using var host = factory.WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
        { services.RemoveAll<TimeProvider>(); services.AddSingleton<TimeProvider>(clock); }));
        using var client = host.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });
        var old = Address();
        await TestIdentity.RegisterAndSignIn(client, old);
        (await TestIdentity.Post(client, "/api/auth/request-email-change", new { newEmail = Address(), currentPassword = TestIdentity.Password })).EnsureSuccessStatusCode();
        clock.Advance(TimeSpan.FromHours(1));
        var state = await Settings(client);
        Assert.True(state.PendingEmailChange!.IsExpired);
        Assert.Equal(old, state.User.Email);
        Assert.False(state.User.EmailConfirmed);
    }

    [Fact]
    public async Task SensitiveChanges_RequireCurrentPassword_RefreshCurrentSessionAndRevokeOtherSessions()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        using var second = factory.CreateAuthenticatedTestClient();
        var address = Address();
        await TestIdentity.RegisterAndSignIn(client, address, confirmationHost: factory);
        await SignIn(second, address);
        Assert.Equal(HttpStatusCode.BadRequest, (await TestIdentity.Post(client, "/api/auth/request-email-change",
            new { newEmail = Address(), currentPassword = "incorrect" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await TestIdentity.Post(client, "/api/auth/change-password",
            new { currentPassword = "incorrect", newPassword = "a new long test password" })).StatusCode);
        Assert.Null((await Settings(client)).PendingEmailChange);
        (await TestIdentity.Post(client, "/api/auth/change-password", new { currentPassword = TestIdentity.Password, newPassword = "a new long test password" })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/auth/settings")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await second.GetAsync("/api/auth/settings")).StatusCode);
    }

    [Fact]
    public async Task AccountUpdates_AreNotWrittenToHouseholdActivity()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var userId = await TestIdentity.RegisterAndSignIn(client, confirmationHost: factory);
        (await TestIdentity.Post(client, "/api/households", new { name = "Household", defaultCurrency = "CAD", timeZoneId = "UTC" })).EnsureSuccessStatusCode();
        int before;
        using (var scope = factory.Services.CreateScope())
            before = await scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>().AuditEvents.CountAsync(item => item.ActorUserId == userId);
        var settings = await Settings(client);
        (await Put(client, new { displayName = "Private profile edit", version = settings.Version })).EnsureSuccessStatusCode();
        (await TestIdentity.Post(client, "/api/auth/request-email-change", new { newEmail = Address(), currentPassword = TestIdentity.Password })).EnsureSuccessStatusCode();
        (await TestIdentity.Post(client, "/api/auth/change-password", new { currentPassword = TestIdentity.Password, newPassword = "a new long test password" })).EnsureSuccessStatusCode();
        using var afterScope = factory.Services.CreateScope();
        Assert.Equal(before, await afterScope.ServiceProvider.GetRequiredService<BudgetAppDbContext>().AuditEvents.CountAsync(item => item.ActorUserId == userId));
    }

    private static async Task<HttpResponseMessage> Put(HttpClient client, object body)
    {
        var csrf = (await client.GetFromJsonAsync<CsrfResponse>("/api/auth/antiforgery"))!;
        using var request = new HttpRequestMessage(HttpMethod.Put, "/api/auth/profile") { Content = JsonContent.Create(body) };
        request.Headers.Add("X-XSRF-TOKEN", csrf.Token);
        return await client.SendAsync(request);
    }
    private static async Task<SettingsResponse> Settings(HttpClient client) => (await client.GetFromJsonAsync<SettingsResponse>("/api/auth/settings"))!;
    private static async Task SignIn(HttpClient client, string email) =>
        (await TestIdentity.Post(client, "/api/auth/login", new { email, password = TestIdentity.Password })).EnsureSuccessStatusCode();
    private IReadOnlyList<EmailMessage> Messages(string address, EmailPurpose purpose) => factory.Services.GetRequiredService<RecordingEmailSender>().Messages
        .Where(message => message.RecipientAddress == address && message.Purpose == purpose).ToList();
    private static string Address() => $"settings-{Guid.NewGuid():N}@example.test";
    private sealed record CsrfResponse(string Token);
    private sealed record UserResponse(Guid Id, string Email, string DisplayName, bool EmailConfirmed);
    private sealed record PendingResponse(string Email, DateTimeOffset RequestedAtUtc, DateTimeOffset ExpiresAtUtc, bool IsExpired);
    private sealed record SettingsResponse(UserResponse User, PendingResponse? PendingEmailChange, string Version);
    private sealed class TestClock : TimeProvider
    {
        private DateTimeOffset now = DateTimeOffset.UtcNow;
        public override DateTimeOffset GetUtcNow() => now;
        public void Advance(TimeSpan elapsed) => now += elapsed;
    }
}
