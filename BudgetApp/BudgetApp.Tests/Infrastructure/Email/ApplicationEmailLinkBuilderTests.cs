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

        var recovery = builder.BuildPasswordRecoveryLink("token +/&?");
        var invitation = builder.BuildHouseholdInvitationLink("invitation token");

        Assert.StartsWith(
            "https://budget.example/reset-password?",
            recovery,
            StringComparison.Ordinal);
        Assert.Contains("token=token%20%2B%2F%26%3F", recovery);
        Assert.StartsWith(
            "https://budget.example/household-invitations/accept?",
            invitation,
            StringComparison.Ordinal);
        Assert.Contains("token=invitation%20token", invitation);
    }

    [Fact]
    public void Constructor_RejectsNonHttpBaseUrl()
    {
        var options = new ApplicationUrlOptions
        {
            PublicBaseUrl = "file:///C:/BudgetApp"
        };

        Assert.Throws<InvalidOperationException>(
            () => new ApplicationEmailLinkBuilder(options));
    }
}
