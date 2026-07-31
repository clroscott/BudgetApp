using System.Net;
using System.Net.Http.Json;
using BudgetApp.Domain.Households;
using BudgetApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace BudgetApp.Tests.Integration;

public sealed class HouseholdInvitationTests(
    BudgetAppWebApplicationFactory factory)
    : IClassFixture<BudgetAppWebApplicationFactory>
{
    [Fact]
    public async Task Invitation_AcceptanceCreatesViewerMembershipForMatchingEmail()
    {
        using var ownerClient = factory.CreateAuthenticatedTestClient();
        using var inviteeClient = factory.CreateAuthenticatedTestClient();
        var ownerEmail = $"owner-{Guid.NewGuid():N}@example.test";
        var inviteeEmail = $"invitee-{Guid.NewGuid():N}@example.test";
        var household = await RegisterAndCreateHousehold(
            ownerClient,
            ownerEmail);
        var sender = factory.Services.GetRequiredService<RecordingEmailSender>();
        sender.Clear();

        var inviteResponse = await Post(
            ownerClient,
            $"/api/households/{household.Id}/invitations",
            new { email = inviteeEmail, role = "Viewer" });
        Assert.Equal(HttpStatusCode.Created, inviteResponse.StatusCode);
        var dispatch = await inviteResponse.Content
            .ReadFromJsonAsync<InvitationDispatchResponse>();
        Assert.True(dispatch?.EmailDelivered);

        var message = Assert.Single(sender.Messages);
        var token = ExtractToken(message.PlainTextBody);

        await Register(inviteeClient, inviteeEmail);
        var preview = await inviteeClient.GetAsync(
            $"/api/household-invitations/preview?token={Uri.EscapeDataString(token)}");
        Assert.Equal(HttpStatusCode.OK, preview.StatusCode);

        var acceptResponse = await Post(
            inviteeClient,
            "/api/household-invitations/accept",
            new { token });
        Assert.Equal(HttpStatusCode.OK, acceptResponse.StatusCode);

        var inviteeHouseholds = await inviteeClient.GetFromJsonAsync<
            List<HouseholdResponse>>("/api/households");
        var acceptedHousehold = Assert.Single(inviteeHouseholds!);
        Assert.Equal(household.Id, acceptedHousehold.Id);
        Assert.Equal("Viewer", acceptedHousehold.Role);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var dbContext = scope.ServiceProvider
                .GetRequiredService<BudgetAppDbContext>();
            var invitationEvents = await dbContext.AuditEvents
                .AsNoTracking()
                .Where(auditEvent =>
                    auditEvent.EntityId == dispatch!.Invitation.Id)
                .OrderBy(auditEvent => auditEvent.OccurredAtUtc)
                .ToListAsync();
            Assert.Equal(
                ["Invited", "Accepted"],
                invitationEvents.Select(auditEvent => auditEvent.Action));
            Assert.DoesNotContain(
                invitationEvents,
                auditEvent =>
                    (auditEvent.DetailsJson ?? string.Empty).Contains(
                        inviteeEmail,
                        StringComparison.OrdinalIgnoreCase) ||
                    (auditEvent.DetailsJson ?? string.Empty).Contains(
                        token,
                        StringComparison.Ordinal));
        }

        var management = await inviteeClient.GetFromJsonAsync<
            ManagementResponse>($"/api/households/{household.Id}/members");
        Assert.False(management?.CanManageInvitations);
        Assert.Equal(2, management?.Members.Count);
        Assert.Empty(management!.Invitations);

        var reuseResponse = await Post(
            inviteeClient,
            "/api/household-invitations/accept",
            new { token });
        Assert.Equal(HttpStatusCode.Gone, reuseResponse.StatusCode);
    }

    [Fact]
    public async Task Invitation_RejectsWrongEmail_AndAllowsAnotherHousehold()
    {
        using var ownerClient = factory.CreateAuthenticatedTestClient();
        using var wrongUserClient = factory.CreateAuthenticatedTestClient();
        var household = await RegisterAndCreateHousehold(
            ownerClient,
            $"owner-{Guid.NewGuid():N}@example.test");
        var invitedEmail = $"invited-{Guid.NewGuid():N}@example.test";
        var sender = factory.Services.GetRequiredService<RecordingEmailSender>();
        sender.Clear();

        await Post(
            ownerClient,
            $"/api/households/{household.Id}/invitations",
            new { email = invitedEmail, role = "Editor" });
        var token = ExtractToken(Assert.Single(sender.Messages).PlainTextBody);

        await Register(
            wrongUserClient,
            $"wrong-{Guid.NewGuid():N}@example.test");
        var mismatchResponse = await Post(
            wrongUserClient,
            "/api/household-invitations/accept",
            new { token });
        Assert.Equal(HttpStatusCode.Forbidden, mismatchResponse.StatusCode);

        using var existingMemberClient = factory.CreateAuthenticatedTestClient();
        await RegisterAndCreateHousehold(existingMemberClient, invitedEmail);
        var existingResponse = await Post(
            existingMemberClient,
            "/api/household-invitations/accept",
            new { token });
        Assert.Equal(HttpStatusCode.OK, existingResponse.StatusCode);

        var memberships = await existingMemberClient.GetFromJsonAsync<
            List<HouseholdResponse>>("/api/households");
        Assert.Equal(2, memberships?.Count);
        Assert.Contains(memberships!, item => item.Id == household.Id);
    }

    [Fact]
    public async Task Resend_RotatesHashedToken_AndRevokeDisablesInvitation()
    {
        using var ownerClient = factory.CreateAuthenticatedTestClient();
        var household = await RegisterAndCreateHousehold(
            ownerClient,
            $"owner-{Guid.NewGuid():N}@example.test");
        var sender = factory.Services.GetRequiredService<RecordingEmailSender>();
        sender.Clear();

        var createResponse = await Post(
            ownerClient,
            $"/api/households/{household.Id}/invitations",
            new
            {
                email = $"invitee-{Guid.NewGuid():N}@example.test",
                role = "Editor"
            });
        var created = await createResponse.Content
            .ReadFromJsonAsync<InvitationDispatchResponse>();
        var firstToken = ExtractToken(Assert.Single(sender.Messages).PlainTextBody);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var dbContext = scope.ServiceProvider
                .GetRequiredService<BudgetAppDbContext>();
            var stored = await dbContext.HouseholdInvitations
                .AsNoTracking()
                .SingleAsync(invitation =>
                    invitation.Id == created!.Invitation.Id);
            Assert.NotEqual(firstToken, stored.TokenHash);
            Assert.Equal(HouseholdInvitation.TokenHashLength, stored.TokenHash.Length);
        }

        sender.Clear();
        var resendResponse = await Post(
            ownerClient,
            $"/api/households/{household.Id}/invitations/{created!.Invitation.Id}/resend",
            new { });
        Assert.Equal(HttpStatusCode.OK, resendResponse.StatusCode);
        var secondToken = ExtractToken(Assert.Single(sender.Messages).PlainTextBody);
        Assert.NotEqual(firstToken, secondToken);

        var oldPreview = await ownerClient.GetAsync(
            $"/api/household-invitations/preview?token={Uri.EscapeDataString(firstToken)}");
        Assert.Equal(HttpStatusCode.NotFound, oldPreview.StatusCode);

        var revokeResponse = await Post(
            ownerClient,
            $"/api/households/{household.Id}/invitations/{created.Invitation.Id}/revoke",
            new { });
        Assert.Equal(HttpStatusCode.NoContent, revokeResponse.StatusCode);

        var revokedPreview = await ownerClient.GetFromJsonAsync<
            PreviewResponse>(
            $"/api/household-invitations/preview?token={Uri.EscapeDataString(secondToken)}");
        Assert.False(revokedPreview?.IsAvailable);
        Assert.Equal("Revoked", revokedPreview?.Status);
    }

    [Fact]
    public async Task MemberCannotReadAnotherHouseholdsManagement()
    {
        using var firstClient = factory.CreateAuthenticatedTestClient();
        using var secondClient = factory.CreateAuthenticatedTestClient();
        var first = await RegisterAndCreateHousehold(
            firstClient,
            $"owner-{Guid.NewGuid():N}@example.test");
        await RegisterAndCreateHousehold(
            secondClient,
            $"owner-{Guid.NewGuid():N}@example.test");

        var response = await secondClient.GetAsync(
            $"/api/households/{first.Id}/members");
        var leaveResponse = await Post(
            secondClient,
            $"/api/households/{first.Id}/leave",
            new { });
        var deleteResponse = await Delete(
            secondClient,
            $"/api/households/{first.Id}/unused");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, leaveResponse.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, deleteResponse.StatusCode);
    }

    [Fact]
    public async Task SoleOwner_CanDeleteUnusedHousehold_ThenAcceptInvitation()
    {
        using var inviterClient = factory.CreateAuthenticatedTestClient();
        using var inviteeClient = factory.CreateAuthenticatedTestClient();
        var inviteeEmail = $"recovery-{Guid.NewGuid():N}@example.test";
        var destination = await RegisterAndCreateHousehold(
            inviterClient,
            $"owner-{Guid.NewGuid():N}@example.test");
        var unused = await RegisterAndCreateHousehold(
            inviteeClient,
            inviteeEmail);
        var sender = factory.Services.GetRequiredService<RecordingEmailSender>();
        sender.Clear();

        await Post(
            inviterClient,
            $"/api/households/{destination.Id}/invitations",
            new { email = inviteeEmail, role = "Editor" });
        var token = ExtractToken(Assert.Single(sender.Messages).PlainTextBody);

        var management = await inviteeClient.GetFromJsonAsync<
            ManagementResponse>($"/api/households/{unused.Id}/members");
        Assert.True(management?.ExitOptions.CanDeleteUnused);
        Assert.False(management?.ExitOptions.CanLeave);

        var deleteResponse = await Delete(
            inviteeClient,
            $"/api/households/{unused.Id}/unused");
        Assert.Equal(HttpStatusCode.NoContent, deleteResponse.StatusCode);

        var acceptResponse = await Post(
            inviteeClient,
            "/api/household-invitations/accept",
            new { token });
        Assert.Equal(HttpStatusCode.OK, acceptResponse.StatusCode);
        var memberships = await inviteeClient.GetFromJsonAsync<
            List<HouseholdResponse>>("/api/households");
        Assert.Equal(destination.Id, Assert.Single(memberships!).Id);

        await using var scope = factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider
            .GetRequiredService<BudgetAppDbContext>();
        Assert.False(await dbContext.Households.AnyAsync(
            household => household.Id == unused.Id));
        Assert.False(await dbContext.Categories.AnyAsync(
            category => category.HouseholdId == unused.Id));
    }

    [Fact]
    public async Task NonOwner_CanLeave_WhileOwnerCannotDeleteOccupiedHousehold()
    {
        using var ownerClient = factory.CreateAuthenticatedTestClient();
        using var memberClient = factory.CreateAuthenticatedTestClient();
        var memberEmail = $"member-{Guid.NewGuid():N}@example.test";
        var household = await RegisterAndCreateHousehold(
            ownerClient,
            $"owner-{Guid.NewGuid():N}@example.test");
        var sender = factory.Services.GetRequiredService<RecordingEmailSender>();
        sender.Clear();

        await Post(
            ownerClient,
            $"/api/households/{household.Id}/invitations",
            new { email = memberEmail, role = "Viewer" });
        var token = ExtractToken(Assert.Single(sender.Messages).PlainTextBody);
        await Register(memberClient, memberEmail);
        (await Post(
            memberClient,
            "/api/household-invitations/accept",
            new { token })).EnsureSuccessStatusCode();

        var ownerManagement = await ownerClient.GetFromJsonAsync<
            ManagementResponse>($"/api/households/{household.Id}/members");
        Assert.False(ownerManagement?.ExitOptions.CanDeleteUnused);
        Assert.Contains(
            "Ownership transfer",
            ownerManagement?.ExitOptions.BlockedReason);
        var ownerDelete = await Delete(
            ownerClient,
            $"/api/households/{household.Id}/unused");
        Assert.Equal(HttpStatusCode.Conflict, ownerDelete.StatusCode);

        var memberManagement = await memberClient.GetFromJsonAsync<
            ManagementResponse>($"/api/households/{household.Id}/members");
        Assert.True(memberManagement?.ExitOptions.CanLeave);

        var leaveResponse = await Post(
            memberClient,
            $"/api/households/{household.Id}/leave",
            new { });
        Assert.Equal(HttpStatusCode.NoContent, leaveResponse.StatusCode);
        Assert.Empty((await memberClient.GetFromJsonAsync<
            List<HouseholdResponse>>("/api/households"))!);

        await using var scope = factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider
            .GetRequiredService<BudgetAppDbContext>();
        Assert.True(await dbContext.AuditEvents.AnyAsync(auditEvent =>
            auditEvent.HouseholdId == household.Id &&
            auditEvent.Action == "Left"));
    }

    [Fact]
    public async Task Owner_CannotDeleteHouseholdWithFinancialDataOrCustomCategories()
    {
        using var financialClient = factory.CreateAuthenticatedTestClient();
        var financial = await RegisterAndCreateHousehold(
            financialClient,
            $"owner-{Guid.NewGuid():N}@example.test");
        (await Post(
            financialClient,
            $"/api/households/{financial.Id}/accounts",
            new
            {
                name = "Test account",
                type = "Chequing",
                scope = "Household",
                currency = "CAD",
                institutionName = (string?)null,
                lastFourDigits = (string?)null
            })).EnsureSuccessStatusCode();

        var financialDelete = await Delete(
            financialClient,
            $"/api/households/{financial.Id}/unused");
        Assert.Equal(HttpStatusCode.Conflict, financialDelete.StatusCode);

        using var customizedClient = factory.CreateAuthenticatedTestClient();
        var customized = await RegisterAndCreateHousehold(
            customizedClient,
            $"owner-{Guid.NewGuid():N}@example.test");
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var dbContext = scope.ServiceProvider
                .GetRequiredService<BudgetAppDbContext>();
            var category = await dbContext.Categories.FirstAsync(item =>
                item.HouseholdId == customized.Id &&
                item.ParentCategoryId == null);
            category.Rename("Customized category", DateTimeOffset.UtcNow);
            await dbContext.SaveChangesAsync();
        }

        var customizedDelete = await Delete(
            customizedClient,
            $"/api/households/{customized.Id}/unused");
        Assert.Equal(HttpStatusCode.Conflict, customizedDelete.StatusCode);
    }

    private static async Task<HouseholdResponse> RegisterAndCreateHousehold(
        HttpClient client,
        string email)
    {
        await Register(client, email);
        var response = await Post(
            client,
            "/api/households",
            new
            {
                name = $"Household {Guid.NewGuid():N}",
                defaultCurrency = "CAD",
                timeZoneId = "UTC"
            });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<HouseholdResponse>())!;
    }

    private static async Task Register(HttpClient client, string email)
    {
        var response = await Post(
            client,
            "/api/auth/register",
            new
            {
                email,
                password = "a long test password",
                displayName = "Invitation Test"
            });
        response.EnsureSuccessStatusCode();
    }

    private static async Task<HttpResponseMessage> Post<T>(
        HttpClient client,
        string path,
        T body)
    {
        var antiforgery = await client.GetFromJsonAsync<AntiforgeryResponse>(
            "/api/auth/antiforgery");
        var request = new HttpRequestMessage(HttpMethod.Post, path)
        {
            Content = JsonContent.Create(body)
        };
        request.Headers.Add("X-XSRF-TOKEN", antiforgery!.Token);
        return await client.SendAsync(request);
    }

    private static async Task<HttpResponseMessage> Delete(
        HttpClient client,
        string path)
    {
        var antiforgery = await client.GetFromJsonAsync<AntiforgeryResponse>(
            "/api/auth/antiforgery");
        var request = new HttpRequestMessage(HttpMethod.Delete, path);
        request.Headers.Add("X-XSRF-TOKEN", antiforgery!.Token);
        return await client.SendAsync(request);
    }

    private static string ExtractToken(string body)
    {
        var link = body
            .Split(["\r\n", "\n"], StringSplitOptions.RemoveEmptyEntries)
            .First(value => value.StartsWith("https://", StringComparison.Ordinal));
        var uri = new Uri(link);
        return uri.Query
            .TrimStart('?')
            .Split('&')
            .Select(value => value.Split('=', 2))
            .Where(parts => parts[0] == "token")
            .Select(parts => Uri.UnescapeDataString(parts[1]))
            .Single();
    }

    private sealed record AntiforgeryResponse(string Token);
    private sealed record HouseholdResponse(Guid Id, string Role);
    private sealed record InvitationItemResponse(Guid Id);
    private sealed record InvitationDispatchResponse(
        InvitationItemResponse Invitation,
        bool EmailDelivered);
    private sealed record ManagementResponse(
        bool CanManageInvitations,
        List<object> Members,
        List<object> Invitations,
        ExitOptionsResponse ExitOptions);
    private sealed record ExitOptionsResponse(
        bool CanLeave,
        bool CanDeleteUnused,
        string? BlockedReason);
    private sealed record PreviewResponse(bool IsAvailable, string Status);
}
