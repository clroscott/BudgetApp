using BudgetApp.Domain.Households;

namespace BudgetApp.Tests.Domain.Households;

public sealed class HouseholdTests
{
    [Fact]
    public void Create_CreatesActiveHouseholdWithActiveOwner()
    {
        var ownerUserId = Guid.NewGuid();
        var createdAtUtc = new DateTimeOffset(2026, 7, 21, 12, 0, 0, TimeSpan.Zero);

        var household = Household.Create(
            "  Scott Household  ",
            "cad",
            "America/Vancouver",
            ownerUserId,
            createdAtUtc);

        Assert.NotEqual(Guid.Empty, household.Id);
        Assert.Equal("Scott Household", household.Name);
        Assert.Equal("CAD", household.DefaultCurrency);
        Assert.Equal("America/Vancouver", household.TimeZoneId);
        Assert.True(household.IsActive);
        Assert.Equal(createdAtUtc, household.CreatedAtUtc);
        Assert.Equal(createdAtUtc, household.UpdatedAtUtc);

        var owner = Assert.Single(household.Members);
        Assert.NotEqual(Guid.Empty, owner.Id);
        Assert.Equal(household.Id, owner.HouseholdId);
        Assert.Equal(ownerUserId, owner.UserId);
        Assert.Equal(HouseholdRole.Owner, owner.Role);
        Assert.Equal(HouseholdMemberStatus.Active, owner.Status);
        Assert.Equal(createdAtUtc, owner.JoinedAtUtc);
        Assert.Null(owner.InvitedByUserId);
        Assert.Equal(createdAtUtc, owner.CreatedAtUtc);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_RejectsMissingName(string name)
    {
        var exception = Assert.Throws<ArgumentException>(() => Household.Create(
            name,
            "CAD",
            "America/Vancouver",
            Guid.NewGuid(),
            DateTimeOffset.UtcNow));

        Assert.Equal("name", exception.ParamName);
    }

    [Theory]
    [InlineData("CA")]
    [InlineData("C4D")]
    [InlineData("CANADIAN")]
    public void Create_RejectsInvalidCurrency(string currency)
    {
        var exception = Assert.Throws<ArgumentException>(() => Household.Create(
            "Scott Household",
            currency,
            "America/Vancouver",
            Guid.NewGuid(),
            DateTimeOffset.UtcNow));

        Assert.Equal("defaultCurrency", exception.ParamName);
    }

    [Fact]
    public void Create_RejectsMissingOwner()
    {
        var exception = Assert.Throws<ArgumentException>(() => Household.Create(
            "Scott Household",
            "CAD",
            "America/Vancouver",
            Guid.Empty,
            DateTimeOffset.UtcNow));

        Assert.Equal("ownerUserId", exception.ParamName);
    }
}
