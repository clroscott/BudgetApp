using System.Net;
using System.Net.Http.Json;
using BudgetApp.Application.Email;
using Microsoft.Extensions.DependencyInjection;

namespace BudgetApp.Tests.Integration;

public sealed class AuthenticationTests(BudgetAppWebApplicationFactory factory)
    : IClassFixture<BudgetAppWebApplicationFactory>
{
    [Fact]
    public async Task CurrentUser_WithoutAuthentication_ReturnsUnauthorized()
    {
        using var client = factory.CreateAuthenticatedTestClient();

        var response = await client.GetAsync("/api/auth/me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task RegisterAndLogout_ManageAuthenticationCookie()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var email = $"identity-{Guid.NewGuid():N}@example.test";
        var token = await GetAntiforgeryToken(client);

        var registerResponse = await PostWithAntiforgeryToken(
            client,
            "/api/auth/register",
            new
            {
                email,
                password = "a long test password",
                displayName = "Identity Test"
            },
            token);

        Assert.Equal(HttpStatusCode.OK, registerResponse.StatusCode);

        var currentUserResponse = await client.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.OK, currentUserResponse.StatusCode);

        token = await GetAntiforgeryToken(client);
        var logoutResponse = await PostWithAntiforgeryToken(
            client,
            "/api/auth/logout",
            new { },
            token);

        Assert.Equal(HttpStatusCode.NoContent, logoutResponse.StatusCode);
        Assert.Equal(
            HttpStatusCode.Unauthorized,
            (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Register_WithoutAntiforgeryToken_IsRejected()
    {
        using var client = factory.CreateAuthenticatedTestClient();

        var response = await client.PostAsJsonAsync(
            "/api/auth/register",
            new
            {
                email = $"identity-{Guid.NewGuid():N}@example.test",
                password = "a long test password",
                displayName = "Identity Test"
            });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Register_WithExistingEmail_IsRejected()
    {
        using var firstClient = factory.CreateAuthenticatedTestClient();
        using var secondClient = factory.CreateAuthenticatedTestClient();
        var email = $"identity-{Guid.NewGuid():N}@example.test";
        var registration = new
        {
            email,
            password = "a long test password",
            displayName = "Identity Test"
        };

        var firstResponse = await PostWithAntiforgeryToken(
            firstClient,
            "/api/auth/register",
            registration,
            await GetAntiforgeryToken(firstClient));
        var duplicateResponse = await PostWithAntiforgeryToken(
            secondClient,
            "/api/auth/register",
            registration,
            await GetAntiforgeryToken(secondClient));

        Assert.Equal(HttpStatusCode.OK, firstResponse.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, duplicateResponse.StatusCode);
    }

    [Fact]
    public async Task ChangePassword_RejectsOldPasswordAndAcceptsNewPassword()
    {
        using var signedInClient = factory.CreateAuthenticatedTestClient();
        var email = $"identity-{Guid.NewGuid():N}@example.test";
        const string oldPassword = "a long test password";
        const string newPassword = "a different long password";

        var registerResponse = await PostWithAntiforgeryToken(
            signedInClient,
            "/api/auth/register",
            new
            {
                email,
                password = oldPassword,
                displayName = "Identity Test"
            },
            await GetAntiforgeryToken(signedInClient));
        Assert.Equal(HttpStatusCode.OK, registerResponse.StatusCode);

        var changeResponse = await PostWithAntiforgeryToken(
            signedInClient,
            "/api/auth/change-password",
            new
            {
                currentPassword = oldPassword,
                newPassword
            },
            await GetAntiforgeryToken(signedInClient));
        Assert.Equal(HttpStatusCode.NoContent, changeResponse.StatusCode);

        using var loginClient = factory.CreateAuthenticatedTestClient();
        var oldPasswordResponse = await PostWithAntiforgeryToken(
            loginClient,
            "/api/auth/login",
            new { email, password = oldPassword, rememberMe = false },
            await GetAntiforgeryToken(loginClient));
        Assert.Equal(HttpStatusCode.Unauthorized, oldPasswordResponse.StatusCode);

        var newPasswordResponse = await PostWithAntiforgeryToken(
            loginClient,
            "/api/auth/login",
            new { email, password = newPassword, rememberMe = false },
            await GetAntiforgeryToken(loginClient));
        Assert.Equal(HttpStatusCode.OK, newPasswordResponse.StatusCode);
    }

    [Fact]
    public async Task ForgotPassword_DoesNotRevealWhetherAccountExists()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var sender = factory.Services.GetRequiredService<RecordingEmailSender>();
        sender.Clear();

        var response = await PostWithAntiforgeryToken(
            client,
            "/api/auth/forgot-password",
            new { email = $"missing-{Guid.NewGuid():N}@example.test" },
            await GetAntiforgeryToken(client));

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<RecoveryResponse>();
        Assert.Contains(
            "If an account exists",
            body?.Message,
            StringComparison.Ordinal);
        Assert.Empty(sender.Messages);
    }

    [Fact]
    public async Task PasswordRecovery_EmailLinkResetsPasswordOnlyOnce()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var sender = factory.Services.GetRequiredService<RecordingEmailSender>();
        var email = $"recovery-{Guid.NewGuid():N}@example.test";
        const string oldPassword = "a long test password";
        const string newPassword = "a different recovery password";

        var registerResponse = await PostWithAntiforgeryToken(
            client,
            "/api/auth/register",
            new
            {
                email,
                password = oldPassword,
                displayName = "Recovery Test"
            },
            await GetAntiforgeryToken(client));
        Assert.Equal(HttpStatusCode.OK, registerResponse.StatusCode);

        sender.Clear();
        var forgotResponse = await PostWithAntiforgeryToken(
            client,
            "/api/auth/forgot-password",
            new { email },
            await GetAntiforgeryToken(client));
        Assert.Equal(HttpStatusCode.Accepted, forgotResponse.StatusCode);

        var message = Assert.Single(sender.Messages);
        Assert.Equal(EmailPurpose.PasswordRecovery, message.Purpose);
        var recoveryUri = ExtractFirstUri(message.PlainTextBody);
        var parameters = ParseQuery(recoveryUri);
        var resetRequest = new
        {
            userId = parameters["userId"],
            token = parameters["token"],
            newPassword
        };

        var resetResponse = await PostWithAntiforgeryToken(
            client,
            "/api/auth/reset-password",
            resetRequest,
            await GetAntiforgeryToken(client));
        Assert.Equal(HttpStatusCode.NoContent, resetResponse.StatusCode);

        var reusedResponse = await PostWithAntiforgeryToken(
            client,
            "/api/auth/reset-password",
            resetRequest,
            await GetAntiforgeryToken(client));
        Assert.Equal(HttpStatusCode.BadRequest, reusedResponse.StatusCode);

        using var loginClient = factory.CreateAuthenticatedTestClient();
        var oldPasswordResponse = await PostWithAntiforgeryToken(
            loginClient,
            "/api/auth/login",
            new { email, password = oldPassword, rememberMe = false },
            await GetAntiforgeryToken(loginClient));
        Assert.Equal(HttpStatusCode.Unauthorized, oldPasswordResponse.StatusCode);

        var newPasswordResponse = await PostWithAntiforgeryToken(
            loginClient,
            "/api/auth/login",
            new { email, password = newPassword, rememberMe = false },
            await GetAntiforgeryToken(loginClient));
        Assert.Equal(HttpStatusCode.OK, newPasswordResponse.StatusCode);
    }

    private static Uri ExtractFirstUri(string text)
    {
        var line = text
            .Split(["\r\n", "\n"], StringSplitOptions.RemoveEmptyEntries)
            .First(value => value.StartsWith("https://", StringComparison.Ordinal));

        return new Uri(line);
    }

    private static Dictionary<string, string> ParseQuery(Uri uri) =>
        uri.Query
            .TrimStart('?')
            .Split('&', StringSplitOptions.RemoveEmptyEntries)
            .Select(value => value.Split('=', 2))
            .ToDictionary(
                parts => Uri.UnescapeDataString(parts[0]),
                parts => Uri.UnescapeDataString(parts[1]));

    private static async Task<string> GetAntiforgeryToken(HttpClient client)
    {
        var response = await client.GetAsync("/api/auth/antiforgery");
        response.EnsureSuccessStatusCode();

        var token = await response.Content.ReadFromJsonAsync<AntiforgeryTokenResponse>();
        return token?.Token ?? throw new InvalidOperationException(
            "The antiforgery endpoint did not return a token.");
    }

    private static Task<HttpResponseMessage> PostWithAntiforgeryToken<TRequest>(
        HttpClient client,
        string requestUri,
        TRequest body,
        string token)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, requestUri)
        {
            Content = JsonContent.Create(body)
        };
        request.Headers.Add("X-XSRF-TOKEN", token);

        return client.SendAsync(request);
    }

    private sealed record AntiforgeryTokenResponse(string Token);

    private sealed record RecoveryResponse(string Message);
}
