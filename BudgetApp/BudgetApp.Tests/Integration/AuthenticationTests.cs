using System.Net;
using System.Net.Http.Json;

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
}
