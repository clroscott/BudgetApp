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

    private sealed class StubLinkBuilder(
        string passwordRecoveryLink,
        string householdInvitationLink) : IApplicationEmailLinkBuilder
    {
        public string BuildPasswordRecoveryLink(string token) =>
            passwordRecoveryLink;

        public string BuildHouseholdInvitationLink(string token) =>
            householdInvitationLink;
    }
}
