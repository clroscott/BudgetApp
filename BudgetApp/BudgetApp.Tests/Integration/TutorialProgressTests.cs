using System.Net;
using System.Net.Http.Json;

namespace BudgetApp.Tests.Integration;

public sealed class TutorialProgressTests(BudgetAppWebApplicationFactory factory)
    : IClassFixture<BudgetAppWebApplicationFactory>
{
    [Fact]
    public async Task Progress_CanBeResumedCompletedAndReplayed()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await Register(client);

        Assert.Empty((await client.GetFromJsonAsync<List<ProgressResponse>>(
            "/api/tutorial-progress"))!);

        var started = await Save(
            client,
            "getting-started",
            version: 1,
            status: "InProgress",
            currentStepIndex: 3);
        Assert.Equal(HttpStatusCode.OK, started.StatusCode);
        var inProgress = await started.Content.ReadFromJsonAsync<ProgressResponse>();
        Assert.Equal("InProgress", inProgress!.Status);
        Assert.Equal(3, inProgress.CurrentStepIndex);

        var completed = await Save(
            client,
            "getting-started",
            version: 1,
            status: "Completed",
            currentStepIndex: 6);
        Assert.Equal(HttpStatusCode.OK, completed.StatusCode);
        var completedProgress =
            await completed.Content.ReadFromJsonAsync<ProgressResponse>();
        Assert.NotNull(completedProgress!.CompletedAtUtc);

        var replayed = await Save(
            client,
            "getting-started",
            version: 1,
            status: "InProgress",
            currentStepIndex: 0);
        Assert.Equal(HttpStatusCode.OK, replayed.StatusCode);
        var replayedProgress =
            await replayed.Content.ReadFromJsonAsync<ProgressResponse>();
        Assert.Null(replayedProgress!.CompletedAtUtc);
        Assert.Equal(0, replayedProgress.CurrentStepIndex);
    }

    [Fact]
    public async Task Progress_IsPrivateToTheSignedInUser()
    {
        using var first = factory.CreateAuthenticatedTestClient();
        await Register(first);
        Assert.Equal(
            HttpStatusCode.OK,
            (await Save(first, "getting-started", 1, "Dismissed", 0)).StatusCode);

        using var second = factory.CreateAuthenticatedTestClient();
        await Register(second);

        Assert.Empty((await second.GetFromJsonAsync<List<ProgressResponse>>(
            "/api/tutorial-progress"))!);
    }

    private static async Task Register(HttpClient client)
    {
        var response = await SendWithAntiforgery(
            client,
            HttpMethod.Post,
            "/api/auth/register",
            new
            {
                email = $"tutorial-{Guid.NewGuid():N}@example.test",
                password = "a long test password",
                displayName = "Tutorial Test"
            });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    private static Task<HttpResponseMessage> Save(
        HttpClient client,
        string tutorialKey,
        int version,
        string status,
        int currentStepIndex) =>
        SendWithAntiforgery(
            client,
            HttpMethod.Put,
            $"/api/tutorial-progress/{tutorialKey}",
            new
            {
                tutorialVersion = version,
                status,
                currentStepIndex
            });

    private static async Task<HttpResponseMessage> SendWithAntiforgery<T>(
        HttpClient client,
        HttpMethod method,
        string path,
        T body)
    {
        var token = (await (await client.GetAsync("/api/auth/antiforgery"))
            .Content.ReadFromJsonAsync<AntiforgeryResponse>())!.Token;
        var request = new HttpRequestMessage(method, path)
        {
            Content = JsonContent.Create(body)
        };
        request.Headers.Add("X-XSRF-TOKEN", token);
        return await client.SendAsync(request);
    }

    private sealed record AntiforgeryResponse(string Token);
    private sealed record ProgressResponse(
        string Status,
        int CurrentStepIndex,
        DateTimeOffset? CompletedAtUtc);
}
