using BudgetApp.Infrastructure.Email;

namespace BudgetApp.Tests.Infrastructure.Email;

public sealed class ApplicationEmailLinkBuilderTests
{
    [Fact]
    public void BuildLinks_UsesConfiguredBaseUrlAndEncodesToken()
    {
        var builder = new ApplicationEmailLinkBuilder(
            new ApplicationUrlOptions
            {
                PublicBaseUrl = "https://budget.example/application/"
            });
        var userId = Guid.NewGuid();

        var recovery = builder.BuildPasswordRecoveryLink(userId, "token +/&?");
        var invitation = builder.BuildHouseholdInvitationLink("invitation token");

        Assert.StartsWith(
            "https://budget.example/reset-password?",
            recovery,
            StringComparison.Ordinal);
        Assert.Contains($"userId={userId}", recovery);
        Assert.Contains("token=token%20%2B%2F%26%3F", recovery);
        Assert.StartsWith(
            "https://budget.example/household-invitations/accept?",
            invitation,
            StringComparison.Ordinal);
        Assert.Contains("token=invitation%20token", invitation);
        var mfa = builder.BuildOperatorMfaRecoveryLink(userId, "recovery +/&?");
        Assert.StartsWith("https://budget.example/recover-mfa?", mfa, StringComparison.Ordinal);
        Assert.Contains($"userId={userId}", mfa);
        Assert.Contains("token=recovery%20%2B%2F%26%3F", mfa);
        Assert.DoesNotContain("email=", mfa);
    }

    [Theory]
    [InlineData(false, "/confirm-email")]
    [InlineData(true, "/confirm-email-change")]
    public void ConfirmationLinks_EncodeTokensAndContainNoTargetEmail(bool changing, string path)
    {
        var builder = new ApplicationEmailLinkBuilder(new ApplicationUrlOptions { PublicBaseUrl = "https://budget.example" });
        var userId = Guid.NewGuid();
        var link = builder.BuildEmailConfirmationLink(userId, "token +/&?", changing);
        Assert.StartsWith($"https://budget.example{path}?", link, StringComparison.Ordinal);
        Assert.Contains($"userId={userId}", link);
        Assert.Contains("token=token%20%2B%2F%26%3F", link);
        Assert.DoesNotContain("email=", link, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData("http://budget.example")]
    [InlineData("file:///C:/BudgetApp")]
    [InlineData("https://user:password@budget.example")]
    [InlineData("https://budget.example?redirect=elsewhere")]
    public void Constructor_RejectsUnsafeBaseUrl(string publicBaseUrl)
    {
        var options = new ApplicationUrlOptions
        {
            PublicBaseUrl = publicBaseUrl
        };

        Assert.Throws<InvalidOperationException>(
            () => new ApplicationEmailLinkBuilder(options));
    }
}
