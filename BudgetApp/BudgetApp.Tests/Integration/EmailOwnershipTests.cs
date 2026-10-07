using System.Net;
using System.Net.Http.Json;
using BudgetApp.Application.Email;
using BudgetApp.Domain.Budgeting;
using BudgetApp.Infrastructure.Data;
using BudgetApp.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace BudgetApp.Tests.Integration;

public sealed class EmailOwnershipTests(BudgetAppWebApplicationFactory factory)
    : IClassFixture<BudgetAppWebApplicationFactory>
{
    [Fact]
    public async Task Registration_SendsAConfirmationButDoesNotSignInOrRevealDuplicateAccounts()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var address = Address();
        var body = new { email = address, password = TestIdentity.Password, displayName = "Confirmation Test" };
        var first = await TestIdentity.Post(client, "/api/auth/register", body);
        var duplicate = await TestIdentity.Post(client, "/api/auth/register", body);
        Assert.Equal(HttpStatusCode.Accepted, first.StatusCode);
        Assert.Equal(first.StatusCode, duplicate.StatusCode);
        Assert.Equal(await first.Content.ReadAsStringAsync(), await duplicate.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
        var message = Assert.Single(Messages(address, EmailPurpose.EmailConfirmation));
        Assert.Contains("expires", message.PlainTextBody);
        Assert.Contains("Sign in to the account", message.PlainTextBody);
        Assert.StartsWith("https://", LinkUri(message).AbsoluteUri);
    }

    [Fact]
    public async Task Confirmation_IsExplicitSingleUse_AndKeepsExistingSessionsSignedIn()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        using var oldSession = factory.CreateAuthenticatedTestClient();
        var address = Address();
        var id = await TestIdentity.RegisterAndSignIn(client, address);
        await SignIn(oldSession, address);
        var link = Confirmation(address);
        // Rendering a link is not a write (mail scanners cannot verify an account).
        await client.GetAsync(LinkUri(Messages(address, EmailPurpose.EmailConfirmation).Single()).PathAndQuery);
        Assert.False((await User(client)).EmailConfirmed);
        Assert.Equal(HttpStatusCode.OK, (await TestIdentity.Post(client, "/api/auth/confirm-email", link)).StatusCode);
        Assert.True((await User(client)).EmailConfirmed);
        Assert.Equal(HttpStatusCode.BadRequest, (await TestIdentity.Post(client, "/api/auth/confirm-email", link)).StatusCode);
        Assert.True((await User(oldSession)).EmailConfirmed);
        Assert.Equal(HttpStatusCode.OK, (await oldSession.GetAsync("/api/households")).StatusCode);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        Assert.Empty(await db.UserTokens.Where(item => item.UserId == id).ToListAsync());
    }

    [Fact]
    public async Task Confirmation_RequiresTheMatchingSignedInAccount_AndRejectsTampering()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        using var other = factory.CreateAuthenticatedTestClient();
        using var anonymous = factory.CreateAuthenticatedTestClient();
        var address = Address();
        await TestIdentity.RegisterAndSignIn(client, address);
        await TestIdentity.RegisterAndSignIn(other);
        var link = Confirmation(address);
        Assert.Equal(HttpStatusCode.Unauthorized, (await TestIdentity.Post(anonymous, "/api/auth/confirm-email", link)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await TestIdentity.Post(other, "/api/auth/confirm-email", link)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await TestIdentity.Post(client, "/api/auth/confirm-email",
            link with { Token = link.Token + "tampered" })).StatusCode);
        Assert.False((await User(client)).EmailConfirmed);
        Assert.False((await User(other)).EmailConfirmed);
        Assert.Equal(HttpStatusCode.OK, (await TestIdentity.Post(client, "/api/auth/confirm-email", link)).StatusCode);
    }

    [Fact]
    public async Task UnverifiedAddress_CannotListPreviewOrAcceptInvitations_EvenWithValidTokenOrId()
    {
        using var owner = factory.CreateAuthenticatedTestClient();
        using var invitee = factory.CreateAuthenticatedTestClient();
        using var anonymous = factory.CreateAuthenticatedTestClient();
        await TestIdentity.RegisterAndSignIn(owner, confirmationHost: factory);
        var household = await CreateHousehold(owner);
        var address = Address();
        var created = await TestIdentity.Post(owner, $"/api/households/{household}/invitations", new { email = address, role = "Viewer" });
        created.EnsureSuccessStatusCode();
        var invitation = (await created.Content.ReadFromJsonAsync<InvitationDispatch>())!.Invitation.Id;
        var token = TestIdentity.LinkParameters(Messages(address, EmailPurpose.HouseholdInvitation).Single().PlainTextBody)["token"];
        await TestIdentity.RegisterAndSignIn(invitee, address);
        var previewPath = $"/api/household-invitations/preview?token={Uri.EscapeDataString(token)}";
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(previewPath)).StatusCode);
        var responses = new[]
        {
            await invitee.GetAsync("/api/household-invitations/pending"),
            await invitee.GetAsync(previewPath),
            await TestIdentity.Post(invitee, "/api/household-invitations/accept", new { token }),
            await TestIdentity.Post(invitee, $"/api/household-invitations/pending/{invitation}/accept", new { }),
            await TestIdentity.Post(invitee, $"/api/household-invitations/pending/{Guid.NewGuid()}/accept", new { })
        };
        foreach (var response in responses)
        {
            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
            var text = await response.Content.ReadAsStringAsync();
            Assert.Contains("EmailConfirmationRequired", text);
            Assert.DoesNotContain("Private household", text);
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await invitee.GetAsync("/api/households")).StatusCode);
        await Confirm(invitee, address);
        Assert.Single((await invitee.GetFromJsonAsync<List<IdResponse>>("/api/household-invitations/pending"))!);
        Assert.Equal(HttpStatusCode.OK, (await invitee.GetAsync(previewPath)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await TestIdentity.Post(invitee,
            $"/api/household-invitations/pending/{invitation}/accept", new { })).StatusCode);
    }

    [Fact]
    public async Task ExistingAccount_IsBlockedUntilConfirmed_WithoutDeletingItsHouseholdOrBudgets()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var address = Address();
        using (var scope = factory.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var result = await users.CreateAsync(new ApplicationUser { Id = Guid.NewGuid(), Email = address,
                UserName = address, DisplayName = "Existing user", EmailConfirmed = true }, TestIdentity.Password);
            Assert.True(result.Succeeded);
        }
        await SignIn(client, address);
        var householdId = await CreateHousehold(client);
        var budget = BudgetMonth.CreateHousehold(householdId, 2026, 1, "CAD", DateTimeOffset.UtcNow);
        Guid userId;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
            var user = await db.Users.SingleAsync(item => item.Email == address);
            userId = user.Id;
            // Arrange a pre-upgrade account with existing data but no ownership proof.
            user.EmailConfirmed = false;
            var category = await db.Categories.FirstAsync(item => item.HouseholdId == householdId && item.ParentCategoryId == null);
            budget.AddLine(category.Id, 1450m, DateTimeOffset.UtcNow);
            db.BudgetMonths.Add(budget);
            await db.SaveChangesAsync();
        }
        Assert.False((await User(client)).EmailConfirmed);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/households")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/households/{householdId}/budgets/2026/1?scope=Household")).StatusCode);
        var blockedCreation = await TestIdentity.Post(client, "/api/households", new { name = "Must not be created", defaultCurrency = "CAD", timeZoneId = "UTC" });
        Assert.Equal(HttpStatusCode.Forbidden, blockedCreation.StatusCode);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
            Assert.True(await db.HouseholdMembers.AnyAsync(item => item.UserId == userId && item.HouseholdId == householdId));
            var unchanged = await db.BudgetMonths.Include(item => item.Lines).SingleAsync(item => item.Id == budget.Id);
            Assert.Equal(1450m, Assert.Single(unchanged.Lines).BudgetedAmount);
            Assert.Equal(1, await db.HouseholdMembers.CountAsync(item => item.UserId == userId));
        }
        Assert.Empty(Messages(address, EmailPurpose.EmailConfirmation));
        Assert.Equal(HttpStatusCode.Accepted, (await TestIdentity.Post(client, "/api/auth/resend-confirmation", new { })).StatusCode);
        await Confirm(client, address);
        Assert.True((await User(client)).EmailConfirmed);
        Assert.Equal(householdId, Assert.Single((await client.GetFromJsonAsync<List<IdResponse>>("/api/households"))!).Id);
        var restored = await client.GetAsync($"/api/households/{householdId}/budgets/2026/1?scope=Household");
        Assert.Equal(HttpStatusCode.OK, restored.StatusCode);
        Assert.Contains(budget.Id.ToString(), await restored.Content.ReadAsStringAsync());
        Assert.Empty((await client.GetFromJsonAsync<List<IdResponse>>("/api/household-invitations/pending"))!);
    }

    [Theory]
    [MemberData(nameof(RestrictedReadPaths))]
    public async Task UnverifiedSession_CannotReadAnyApplicationArea(string path)
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await TestIdentity.RegisterAndSignIn(client);
        var response = await client.GetAsync(path);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Contains("EmailConfirmationRequired", await response.Content.ReadAsStringAsync());
    }

    public static TheoryData<string> RestrictedReadPaths => new()
    {
        "/api/households",
        $"/api/households/{Guid.NewGuid()}/accounts",
        $"/api/households/{Guid.NewGuid()}/annual-budget-overview/2026?scope=Household",
        $"/api/households/{Guid.NewGuid()}/audit-events",
        $"/api/households/{Guid.NewGuid()}/budgets",
        $"/api/households/{Guid.NewGuid()}/categories",
        $"/api/households/{Guid.NewGuid()}/categorization-rules",
        $"/api/households/{Guid.NewGuid()}/dashboard-layout",
        $"/api/households/{Guid.NewGuid()}/import-profiles",
        $"/api/households/{Guid.NewGuid()}/imports",
        $"/api/households/{Guid.NewGuid()}/members",
        $"/api/households/{Guid.NewGuid()}/settings",
        $"/api/households/{Guid.NewGuid()}/recurring-expenses",
        $"/api/households/{Guid.NewGuid()}/transactions",
        $"/api/households/{Guid.NewGuid()}/yearly-plans/2026?scope=Household",
        "/api/household-invitations/pending",
        "/api/tutorial-progress"
    };

    [Theory]
    [InlineData("POST", "/api/households")]
    [InlineData("POST", "/api/households/{household}/accounts")]
    [InlineData("POST", "/api/households/{household}/imports")]
    [InlineData("POST", "/api/households/{household}/budgets/2026/1")]
    [InlineData("PUT", "/api/households/{household}/settings")]
    [InlineData("PUT", "/api/households/{household}/yearly-plans/2026")]
    [InlineData("PUT", "/api/tutorial-progress/first-steps")]
    [InlineData("DELETE", "/api/households/{household}/unused")]
    [InlineData("DELETE", "/api/households/{household}/budgets/{id}")]
    public async Task UnverifiedSession_CannotCreateEditImportOrDeleteAppData(string method, string path)
    {
        using var client = factory.CreateAuthenticatedTestClient();
        await TestIdentity.RegisterAndSignIn(client);
        var csrf = await client.GetFromJsonAsync<System.Text.Json.JsonElement>("/api/auth/antiforgery");
        using var request = new HttpRequestMessage(new HttpMethod(method),
            path.Replace("{household}", Guid.NewGuid().ToString()).Replace("{id}", Guid.NewGuid().ToString()))
            { Content = JsonContent.Create(new { }) };
        request.Headers.Add("X-XSRF-TOKEN", csrf.GetProperty("token").GetString());
        var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Contains("EmailConfirmationRequired", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task VerificationGate_AllowsAccountRecoveryResendStatusLogoutAndHealth()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var address = Address();
        await TestIdentity.RegisterAndSignIn(client, address);
        Assert.False((await User(client)).EmailConfirmed);
        (await client.GetAsync("/api/health")).EnsureSuccessStatusCode();
        (await TestIdentity.Post(client, "/api/auth/resend-confirmation", new { })).EnsureSuccessStatusCode();
        (await TestIdentity.Post(client, "/api/auth/forgot-password", new { email = address })).EnsureSuccessStatusCode();
        (await TestIdentity.Post(client, "/api/auth/logout", new { })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task RecipientCanRecoverAnImpersonatedRegistration_WithoutUnlockingTheAttackersSession()
    {
        using var initialize = factory.CreateAuthenticatedTestClient();
        var clock = new TestClock();
        using var host = WithClock(clock);
        using var attacker = Client(host);
        using var recipient = Client(host);
        var address = Address();
        await TestIdentity.RegisterAndSignIn(attacker, address);
        var original = Confirmation(host, address);
        (await TestIdentity.Post(recipient, "/api/auth/forgot-password", new { email = address })).EnsureSuccessStatusCode();
        var reset = Parameters(Messages(host, address, EmailPurpose.PasswordRecovery).Single());
        const string recoveredPassword = "only the recipient knows this passphrase";
        Assert.Equal(HttpStatusCode.NoContent, (await TestIdentity.Post(recipient, "/api/auth/reset-password",
            new { reset.UserId, reset.Token, newPassword = recoveredPassword })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await attacker.GetAsync("/api/household-invitations/pending")).StatusCode);
        (await TestIdentity.Post(recipient, "/api/auth/login", new { email = address, password = recoveredPassword })).EnsureSuccessStatusCode();
        Assert.False((await User(recipient)).EmailConfirmed);
        Assert.Equal(HttpStatusCode.BadRequest, (await TestIdentity.Post(recipient, "/api/auth/confirm-email", original)).StatusCode);
        clock.Advance(TimeSpan.FromSeconds(61));
        (await TestIdentity.Post(recipient, "/api/auth/resend-confirmation", new { })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.OK, (await TestIdentity.Post(recipient, "/api/auth/confirm-email", Confirmation(host, address))).StatusCode);
        Assert.True((await User(recipient)).EmailConfirmed);
        Assert.Equal(HttpStatusCode.Unauthorized, (await attacker.GetAsync("/api/household-invitations/pending")).StatusCode);
    }

    [Fact]
    public async Task ConfirmedAccount_ResendIsANoOpWithoutSendingOrUnverifyingTheAddress()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var address = Address();
        await TestIdentity.RegisterAndSignIn(client, address);
        await Confirm(client, address);
        Assert.Equal(HttpStatusCode.Accepted, (await TestIdentity.Post(client, "/api/auth/resend-confirmation", new { })).StatusCode);
        Assert.Single(Messages(address, EmailPurpose.EmailConfirmation));
        Assert.True((await User(client)).EmailConfirmed);
    }

    [Fact]
    public async Task ExpiryAndResend_AreDurableAndReplacePreviousTokens()
    {
        using var initialize = factory.CreateAuthenticatedTestClient();
        var clock = new TestClock();
        using var host = WithClock(clock);
        using var client = Client(host);
        using var secondSession = Client(host);
        var address = Address();
        var id = await TestIdentity.RegisterAndSignIn(client, address);
        await SignIn(secondSession, address);
        var first = Confirmation(host, address);
        for (var i = 0; i < 3; i++)
            Assert.Equal(HttpStatusCode.Accepted, (await TestIdentity.Post(secondSession, "/api/auth/resend-confirmation", new { })).StatusCode);
        Assert.Single(Messages(host, address, EmailPurpose.EmailConfirmation));
        using (var scope = host.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
            var stored = Assert.Single(await db.UserTokens.Where(item => item.UserId == id).ToListAsync());
            Assert.DoesNotContain(first.Token, stored.Value);
            Assert.Contains("ExpiresAt", stored.Value);
        }
        clock.Advance(TimeSpan.FromMinutes(61));
        Assert.Equal(HttpStatusCode.BadRequest, (await TestIdentity.Post(client, "/api/auth/confirm-email", first)).StatusCode);
        Assert.False((await User(client)).EmailConfirmed);
        (await TestIdentity.Post(client, "/api/auth/resend-confirmation", new { })).EnsureSuccessStatusCode();
        var replacement = Confirmation(host, address);
        Assert.Equal(2, Messages(host, address, EmailPurpose.EmailConfirmation).Count);
        Assert.NotEqual(first.Token, replacement.Token);
        Assert.Equal(HttpStatusCode.BadRequest, (await TestIdentity.Post(client, "/api/auth/confirm-email", first)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await TestIdentity.Post(client, "/api/auth/confirm-email", replacement)).StatusCode);
    }

    [Fact]
    public async Task Resend_AfterCooldownInvalidatesAnUnexpiredLink()
    {
        using var initialize = factory.CreateAuthenticatedTestClient();
        var clock = new TestClock();
        using var host = WithClock(clock);
        using var client = Client(host);
        var address = Address();
        await TestIdentity.RegisterAndSignIn(client, address);
        var first = Confirmation(host, address);
        clock.Advance(TimeSpan.FromSeconds(61));
        (await TestIdentity.Post(client, "/api/auth/resend-confirmation", new { })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.BadRequest, (await TestIdentity.Post(client, "/api/auth/confirm-email", first)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await TestIdentity.Post(client, "/api/auth/confirm-email", Confirmation(host, address))).StatusCode);
    }

    [Fact]
    public async Task Resend_HasAPerAccountRequestRateLimit_InAdditionToDeliveryCooldown()
    {
        using var initialize = factory.CreateAuthenticatedTestClient();
        using var host = factory.WithWebHostBuilder(builder => builder.ConfigureAppConfiguration((_, configuration) =>
            configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["EmailOwnershipRateLimit:PermitLimit"] = "2" })));
        using var client = Client(host);
        using var second = Client(host);
        var address = Address();
        await TestIdentity.RegisterAndSignIn(client, address);
        await SignIn(second, address);
        for (var i = 0; i < 2; i++)
            Assert.Equal(HttpStatusCode.Accepted, (await TestIdentity.Post(client, "/api/auth/resend-confirmation", new { })).StatusCode);
        var limited = await TestIdentity.Post(second, "/api/auth/resend-confirmation", new { });
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
        Assert.True(limited.Headers.Contains("Retry-After"));
        Assert.Contains("then try again", await limited.Content.ReadAsStringAsync());
        Assert.Single(Messages(host, address, EmailPurpose.EmailConfirmation));
    }

    [Fact]
    public async Task EmailChange_KeepsOldAddressUntilProof_ThenUpdatesLoginAndInvalidatesOtherSessions()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        using var oldSession = factory.CreateAuthenticatedTestClient();
        var oldAddress = Address();
        var newAddress = Address();
        await TestIdentity.RegisterAndSignIn(client, oldAddress);
        await Confirm(client, oldAddress);
        await SignIn(oldSession, oldAddress);
        var household = await CreateHousehold(client);
        var requested = await TestIdentity.Post(client, "/api/auth/request-email-change",
            new { newEmail = newAddress, currentPassword = TestIdentity.Password });
        Assert.Equal(HttpStatusCode.Accepted, requested.StatusCode);
        Assert.Equal(oldAddress, (await User(client)).Email);
        Assert.True((await User(client)).EmailConfirmed);
        var message = Assert.Single(Messages(newAddress, EmailPurpose.EmailChange));
        Assert.DoesNotContain(newAddress, LinkUri(message).Query);
        var change = Parameters(message);
        Assert.Equal(HttpStatusCode.OK, (await TestIdentity.Post(client, "/api/auth/confirm-email-change", change)).StatusCode);
        Assert.Equal(newAddress, (await User(client)).Email);
        Assert.True((await User(client)).EmailConfirmed);
        Assert.Equal(household, Assert.Single((await client.GetFromJsonAsync<List<IdResponse>>("/api/households"))!).Id);
        Assert.Equal(HttpStatusCode.Unauthorized, (await oldSession.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await TestIdentity.Post(client, "/api/auth/confirm-email-change", change)).StatusCode);
        using var login = factory.CreateAuthenticatedTestClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await TestIdentity.Post(login, "/api/auth/login", new { email = oldAddress, password = TestIdentity.Password })).StatusCode);
        await SignIn(login, newAddress);
    }

    [Fact]
    public async Task EmailChange_DuplicateAddressAndCooldownHaveGenericResponses_AndWrongPasswordIsRejected()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        using var other = factory.CreateAuthenticatedTestClient();
        var oldAddress = Address();
        var taken = Address();
        await TestIdentity.RegisterAndSignIn(client, oldAddress);
        await TestIdentity.RegisterAndSignIn(other, taken);
        var wrongPassword = await TestIdentity.Post(client, "/api/auth/request-email-change",
            new { newEmail = Address(), currentPassword = "wrong password" });
        Assert.Equal(HttpStatusCode.BadRequest, wrongPassword.StatusCode);
        var duplicate = await TestIdentity.Post(client, "/api/auth/request-email-change",
            new { newEmail = taken, currentPassword = TestIdentity.Password });
        var unused = await TestIdentity.Post(client, "/api/auth/request-email-change",
            new { newEmail = Address(), currentPassword = TestIdentity.Password });
        Assert.Equal(HttpStatusCode.Accepted, duplicate.StatusCode);
        Assert.Equal(duplicate.StatusCode, unused.StatusCode);
        Assert.Equal(await duplicate.Content.ReadAsStringAsync(), await unused.Content.ReadAsStringAsync());
        Assert.Empty(Messages(taken, EmailPurpose.EmailChange));
        Assert.Equal(oldAddress, (await User(client)).Email);
    }

    [Fact]
    public async Task EmailChange_AnAddressClaimedAfterRequestDoesNotPartiallyChangeEmailOrUsername()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        using var claimant = factory.CreateAuthenticatedTestClient();
        var oldAddress = Address();
        var target = Address();
        var id = await TestIdentity.RegisterAndSignIn(client, oldAddress);
        await Confirm(client, oldAddress);
        (await TestIdentity.Post(client, "/api/auth/request-email-change", new { newEmail = target, currentPassword = TestIdentity.Password })).EnsureSuccessStatusCode();
        var link = Parameters(Messages(target, EmailPurpose.EmailChange).Single());
        await TestIdentity.RegisterAndSignIn(claimant, target);
        Assert.Equal(HttpStatusCode.BadRequest, (await TestIdentity.Post(client, "/api/auth/confirm-email-change", link)).StatusCode);
        Assert.Equal(oldAddress, (await User(client)).Email);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
        var stored = await db.Users.AsNoTracking().SingleAsync(user => user.Id == id);
        Assert.Equal(oldAddress, stored.UserName);
        Assert.True(stored.EmailConfirmed);
    }

    [Fact]
    public async Task EmailChange_ReplacesAddressForUnverifiedUser_AndOldConfirmationCannotVerifyIt()
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var oldAddress = Address();
        var target = Address();
        await TestIdentity.RegisterAndSignIn(client, oldAddress);
        var oldProof = Confirmation(oldAddress);
        (await TestIdentity.Post(client, "/api/auth/request-email-change", new { newEmail = target, currentPassword = TestIdentity.Password })).EnsureSuccessStatusCode();
        var change = Parameters(Messages(target, EmailPurpose.EmailChange).Single());
        Assert.Equal(HttpStatusCode.BadRequest, (await TestIdentity.Post(client, "/api/auth/confirm-email", change)).StatusCode);
        Assert.False((await User(client)).EmailConfirmed);
        Assert.Equal(HttpStatusCode.OK, (await TestIdentity.Post(client, "/api/auth/confirm-email-change", change)).StatusCode);
        Assert.Equal(target, (await User(client)).Email);
        Assert.True((await User(client)).EmailConfirmed);
        Assert.Equal(HttpStatusCode.BadRequest, (await TestIdentity.Post(client, "/api/auth/confirm-email", oldProof)).StatusCode);
    }

    [Fact]
    public async Task EmailChange_LinkExpiresAndCanOnlyBeConfirmedByTheRequestingAccount()
    {
        using var initialize = factory.CreateAuthenticatedTestClient();
        var clock = new TestClock();
        using var host = WithClock(clock);
        using var client = Client(host);
        using var other = Client(host);
        var address = Address();
        var target = Address();
        await TestIdentity.RegisterAndSignIn(client, address);
        await TestIdentity.RegisterAndSignIn(other);
        (await TestIdentity.Post(client, "/api/auth/request-email-change", new { newEmail = target, currentPassword = TestIdentity.Password })).EnsureSuccessStatusCode();
        var link = Parameters(Messages(host, target, EmailPurpose.EmailChange).Single());
        Assert.Equal(HttpStatusCode.BadRequest, (await TestIdentity.Post(other, "/api/auth/confirm-email-change", link)).StatusCode);
        clock.Advance(TimeSpan.FromHours(1));
        Assert.Equal(HttpStatusCode.BadRequest, (await TestIdentity.Post(client, "/api/auth/confirm-email-change", link)).StatusCode);
        Assert.Equal(address, (await User(client)).Email);
        Assert.False((await User(client)).EmailConfirmed);
    }

    [Fact]
    public async Task FailedEmailDelivery_LeavesAccountUsableAndResponsesGeneric_WithExplicitRetry()
    {
        using var initialize = factory.CreateAuthenticatedTestClient();
        var clock = new TestClock();
        var sender = new SwitchableSender();
        using var host = factory.WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<TimeProvider>(); services.AddSingleton<TimeProvider>(clock);
            services.RemoveAll<IEmailSender>(); services.AddSingleton<IEmailSender>(sender);
        }));
        using var client = Client(host);
        var address = Address();
        var target = Address();
        await TestIdentity.RegisterAndSignIn(client, address);
        var resend = await TestIdentity.Post(client, "/api/auth/resend-confirmation", new { });
        var change = await TestIdentity.Post(client, "/api/auth/request-email-change", new { newEmail = target, currentPassword = TestIdentity.Password });
        Assert.Equal(HttpStatusCode.Accepted, resend.StatusCode);
        Assert.Equal(await resend.Content.ReadAsStringAsync(), await change.Content.ReadAsStringAsync());
        Assert.False((await User(client)).EmailConfirmed);
        Assert.Equal(address, (await User(client)).Email);
        Assert.Empty(sender.Messages);
        sender.Fail = false;
        clock.Advance(TimeSpan.FromSeconds(61));
        (await TestIdentity.Post(client, "/api/auth/resend-confirmation", new { })).EnsureSuccessStatusCode();
        var proof = Parameters(Assert.Single(sender.Messages));
        Assert.Equal(HttpStatusCode.OK, (await TestIdentity.Post(client, "/api/auth/confirm-email", proof)).StatusCode);
    }

    [Theory]
    [InlineData("resend-confirmation")]
    [InlineData("confirm-email")]
    [InlineData("confirm-email-change")]
    [InlineData("request-email-change")]
    public async Task EmailMutations_RequireCsrf(string endpoint)
    {
        using var client = factory.CreateAuthenticatedTestClient();
        var id = await TestIdentity.RegisterAndSignIn(client);
        var response = await client.PostAsJsonAsync($"/api/auth/{endpoint}",
            new { userId = id, token = "invalid", newEmail = Address(), currentPassword = TestIdentity.Password });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    private IReadOnlyList<EmailMessage> Messages(string email, EmailPurpose purpose) => Messages(factory, email, purpose);
    private static IReadOnlyList<EmailMessage> Messages(WebApplicationFactory<Program> host, string email, EmailPurpose purpose) =>
        host.Services.GetRequiredService<RecordingEmailSender>().Messages
            .Where(message => message.RecipientAddress == email && message.Purpose == purpose).ToList();
    private Proof Confirmation(string address) => Confirmation(factory, address);
    private static Proof Confirmation(WebApplicationFactory<Program> host, string address) =>
        Parameters(Messages(host, address, EmailPurpose.EmailConfirmation).Last());
    private static Proof Parameters(EmailMessage message)
    {
        var values = TestIdentity.LinkParameters(message.PlainTextBody);
        return new Proof(Guid.Parse(values["userId"]), values["token"]);
    }
    private static Uri LinkUri(EmailMessage message) => new(message.PlainTextBody
        .Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries).First(line => line.StartsWith("https://", StringComparison.Ordinal)));
    private async Task Confirm(HttpClient client, string address) =>
        Assert.Equal(HttpStatusCode.OK, (await TestIdentity.Post(client, "/api/auth/confirm-email", Confirmation(address))).StatusCode);
    private static async Task SignIn(HttpClient client, string address) =>
        Assert.Equal(HttpStatusCode.OK, (await TestIdentity.Post(client, "/api/auth/login", new { email = address, password = TestIdentity.Password })).StatusCode);
    private static async Task<Guid> CreateHousehold(HttpClient client)
    {
        var response = await TestIdentity.Post(client, "/api/households",
            new { name = "Private household", defaultCurrency = "CAD", timeZoneId = "UTC" });
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<IdResponse>())!.Id;
    }
    private static async Task<UserResponse> User(HttpClient client) => (await client.GetFromJsonAsync<UserResponse>("/api/auth/me"))!;
    private WebApplicationFactory<Program> WithClock(TestClock clock) => factory.WithWebHostBuilder(builder =>
        builder.ConfigureTestServices(services => { services.RemoveAll<TimeProvider>(); services.AddSingleton<TimeProvider>(clock); }));
    private static HttpClient Client(WebApplicationFactory<Program> host) => host.CreateClient(new WebApplicationFactoryClientOptions
        { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });
    private static string Address() => $"ownership-{Guid.NewGuid():N}@example.test";
    private sealed record Proof(Guid UserId, string Token);
    private sealed record UserResponse(Guid Id, string Email, bool EmailConfirmed);
    private sealed record IdResponse(Guid Id);
    private sealed record InvitationDispatch(IdResponse Invitation);
    private sealed class TestClock : TimeProvider
    {
        private DateTimeOffset now = DateTimeOffset.UtcNow;
        public override DateTimeOffset GetUtcNow() => now;
        public void Advance(TimeSpan amount) => now += amount;
    }
    private sealed class SwitchableSender : IEmailSender
    {
        public bool Fail { get; set; } = true;
        public List<EmailMessage> Messages { get; } = [];
        public Task SendAsync(EmailMessage message, CancellationToken cancellationToken = default)
        {
            if (Fail) throw new InvalidOperationException("Provider unavailable");
            Messages.Add(message);
            return Task.CompletedTask;
        }
    }
}
