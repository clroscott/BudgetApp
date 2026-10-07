using BudgetApp.Application.Email;

namespace BudgetApp.Tests.Application.Email;

public sealed class EmailTemplateFactoryTests
{
    [Fact]
    public void CreatePasswordRecovery_UsesConfiguredLinkAndIncludesGuidance()
    {
        var factory = new EmailTemplateFactory(
            new StubLinkBuilder(
                "https://budget.example/reset-password?token=reset-token",
                "https://budget.example/household-invitations/accept?token=invite-token"));

        var message = factory.CreatePasswordRecovery(
            "person@example.test",
            Guid.NewGuid(),
            "reset-token",
            new DateTimeOffset(2026, 8, 1, 18, 30, 0, TimeSpan.Zero));

        Assert.Equal(EmailPurpose.PasswordRecovery, message.Purpose);
        Assert.Contains("https://budget.example/reset-password", message.PlainTextBody);
        Assert.Contains("expires", message.PlainTextBody, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("only be used once", message.PlainTextBody);
        Assert.Contains("ignore this message", message.PlainTextBody);
        Assert.DoesNotContain("localhost", message.PlainTextBody);
    }

    [Fact]
    public void CreateHouseholdInvitation_EncodesUserControlledHtml()
    {
        var factory = new EmailTemplateFactory(
            new StubLinkBuilder(
                "https://budget.example/reset",
                "https://budget.example/invite?token=invite-token"));

        var message = factory.CreateHouseholdInvitation(
            "person@example.test",
            "<Family & Friends>",
            "<Clay>",
            "invite-token",
            new DateTimeOffset(2026, 8, 2, 18, 30, 0, TimeSpan.Zero));

        Assert.Equal(EmailPurpose.HouseholdInvitation, message.Purpose);
        Assert.Contains("&lt;Family &amp; Friends&gt;", message.HtmlBody);
        Assert.Contains("&lt;Clay&gt;", message.HtmlBody);
        Assert.DoesNotContain("<Family & Friends>", message.HtmlBody);
        Assert.Contains("expires", message.PlainTextBody, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void Confirmation_IncludesExpiryAccountSafetyAndEscapedLink(bool changing)
    {
        var factory = new EmailTemplateFactory(new StubLinkBuilder("https://budget.example/reset", "https://budget.example/invite"));
        var message = factory.CreateEmailConfirmation("person@example.test", Guid.NewGuid(), "<unsafe>&token",
            DateTimeOffset.UtcNow.AddHours(1), changing);
        Assert.Equal(changing ? EmailPurpose.EmailChange : EmailPurpose.EmailConfirmation, message.Purpose);
        Assert.Contains("Sign in to the account", message.PlainTextBody);
        Assert.Contains("can only be used once", message.PlainTextBody);
        Assert.Contains("do not confirm it", message.PlainTextBody);
        Assert.Contains("&lt;unsafe&gt;&amp;token", message.HtmlBody);
        Assert.DoesNotContain("<unsafe>", message.HtmlBody);
        if (changing) Assert.Contains("remains unchanged", message.PlainTextBody);
    }

    private sealed class StubLinkBuilder(
        string passwordRecoveryLink,
        string householdInvitationLink) : IApplicationEmailLinkBuilder
    {
        public string BuildPasswordRecoveryLink(Guid userId, string token) =>
            passwordRecoveryLink;

        public string BuildHouseholdInvitationLink(string token) =>
            householdInvitationLink;

        public string BuildEmailConfirmationLink(Guid userId, string token, bool changeEmail) =>
            $"https://budget.example/{(changeEmail ? "confirm-email-change" : "confirm-email")}?token={token}&userId={userId}";
    }
}
