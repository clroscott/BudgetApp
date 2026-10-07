using System.Net;
using System.Net.Http.Json;
using BudgetApp.Application.Email;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace BudgetApp.Tests.Integration;

internal static class TestIdentity
{
    public const string Password = "a long test password";

    public static async Task<Guid> RegisterAndSignIn(HttpClient client, string? email = null,
        string password = Password, string displayName = "Test user", WebApplicationFactory<Program>? confirmationHost = null)
    {
        email ??= $"test-{Guid.NewGuid():N}@example.test";
        var registered = await Post(client, "/api/auth/register", new { email, password, displayName });
        Assert.Equal(HttpStatusCode.Accepted, registered.StatusCode);
        var signedIn = await Post(client, "/api/auth/login", new { email, password });
        Assert.Equal(HttpStatusCode.OK, signedIn.StatusCode);
        var id = (await signedIn.Content.ReadFromJsonAsync<UserResponse>())!.Id;
        if (confirmationHost is not null)
        {
            var confirmation = confirmationHost.Services.GetRequiredService<RecordingEmailSender>().Messages
                .Last(message => message.Purpose == EmailPurpose.EmailConfirmation && message.RecipientAddress == email);
            var values = LinkParameters(confirmation.PlainTextBody);
            var verified = await Post(client, "/api/auth/confirm-email", new { userId = id, token = values["token"] });
            Assert.Equal(HttpStatusCode.OK, verified.StatusCode);
        }
        return id;
    }

    public static async Task<HttpResponseMessage> Post(HttpClient client, string path, object body)
    {
        var csrf = (await client.GetFromJsonAsync<CsrfResponse>("/api/auth/antiforgery"))!;
        using var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(body) };
        request.Headers.Add("X-XSRF-TOKEN", csrf.Token);
        return await client.SendAsync(request);
    }

    public static Dictionary<string, string> LinkParameters(string body) =>
        new Uri(body.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries)
            .First(line => line.StartsWith("https://", StringComparison.Ordinal)))
            .Query.TrimStart('?').Split('&').Select(part => part.Split('=', 2))
            .ToDictionary(part => Uri.UnescapeDataString(part[0]), part => Uri.UnescapeDataString(part[1]));

    private sealed record CsrfResponse(string Token);
    private sealed record UserResponse(Guid Id);
}
