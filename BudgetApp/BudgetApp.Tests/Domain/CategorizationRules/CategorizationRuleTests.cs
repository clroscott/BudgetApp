using BudgetApp.Domain.CategorizationRules;

namespace BudgetApp.Tests.Domain.CategorizationRules;

public sealed class CategorizationRuleTests
{
    private static readonly DateTimeOffset CreatedAtUtc =
        new(2026, 7, 28, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Create_TrimsAndNormalizesText()
    {
        var rule = Create(
            CategorizationRuleMatchOperator.Contains,
            "  NETFLIX  ");

        Assert.Equal("Netflix subscription", rule.Name);
        Assert.Equal("NETFLIX SUBSCRIPTION", rule.NormalizedName);
        Assert.Equal("NETFLIX", rule.MatchValue);
        Assert.Equal("NETFLIX", rule.NormalizedMatchValue);
        Assert.True(rule.IsActive);
        Assert.Equal(0, rule.Priority);
    }

    [Theory]
    [InlineData(CategorizationRuleMatchOperator.Contains, "Monthly Netflix charge")]
    [InlineData(CategorizationRuleMatchOperator.StartsWith, "NETFLIX.COM 123")]
    [InlineData(CategorizationRuleMatchOperator.EndsWith, "Payment to netflix")]
    [InlineData(CategorizationRuleMatchOperator.Exact, "netflix")]
    public void Matches_UsesSelectedOperatorIgnoringCase(
        CategorizationRuleMatchOperator matchOperator,
        string description)
    {
        var accountId = Guid.NewGuid();
        var rule = Create(matchOperator, "Netflix", accountId);

        Assert.True(rule.Matches(accountId, description));
    }

    [Fact]
    public void Matches_RejectsAnotherAccountWhenRuleIsRestricted()
    {
        var rule = Create(
            CategorizationRuleMatchOperator.Contains,
            "Netflix",
            Guid.NewGuid());

        Assert.False(rule.Matches(Guid.NewGuid(), "Netflix"));
    }

    [Fact]
    public void Matches_ReturnsFalseWhenRuleIsInactive()
    {
        var accountId = Guid.NewGuid();
        var rule = Create(
            CategorizationRuleMatchOperator.Contains,
            "Netflix",
            accountId);

        rule.Deactivate(CreatedAtUtc.AddMinutes(1));

        Assert.False(rule.Matches(accountId, "Netflix"));
    }

    [Fact]
    public void SetPriority_RejectsNegativeValue()
    {
        var rule = Create(
            CategorizationRuleMatchOperator.Contains,
            "Netflix");

        Assert.Throws<ArgumentOutOfRangeException>(() =>
            rule.SetPriority(-1, CreatedAtUtc.AddMinutes(1)));
    }

    private static CategorizationRule Create(
        CategorizationRuleMatchOperator matchOperator,
        string matchValue,
        Guid? accountId = null) =>
        CategorizationRule.Create(
            Guid.NewGuid(),
            "  Netflix subscription  ",
            CategorizationRuleMatchField.Description,
            matchOperator,
            matchValue,
            accountId,
            Guid.NewGuid(),
            0,
            CreatedAtUtc);
}
