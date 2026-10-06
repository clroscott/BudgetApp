using BudgetApp.Domain.Transactions;

namespace BudgetApp.Tests.Domain.Transactions;

public sealed class TransactionBudgetInclusionTests
{
    [Fact]
    public void Choices_AreIndependentPerUser_WithoutChangingFinancialDetails()
    {
        var owner = Guid.NewGuid();
        var other = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;
        var transaction = Create(owner, now);
        transaction.InitializeBudgetInclusion(false, owner);
        transaction.SetBudgetInclusionForUser(owner, true, true, now.AddMinutes(1));
        transaction.SetBudgetInclusionForUser(other, null, true, now.AddMinutes(2));
        transaction.SetBudgetInclusionForUser(other, null, true, now.AddMinutes(3));
        Assert.Equal(2, transaction.PersonalBudgetInclusions.Count);
        transaction.SetBudgetInclusionForUser(owner, null, false, now.AddMinutes(4));
        Assert.Equal(other, Assert.Single(transaction.PersonalBudgetInclusions).UserId);
        Assert.True(transaction.IncludeInHouseholdBudget);
        Assert.Equal(1200m, transaction.Amount);
        Assert.Equal("Rent", transaction.Description);
        transaction.SetBudgetInclusionForUser(other, false, false, now.AddMinutes(5));
        Assert.Empty(transaction.PersonalBudgetInclusions);
        Assert.True(transaction.IsExcludedFromBudget);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void Initialization_PreservesExcludedLegacyTransactions(bool household)
    {
        var owner = Guid.NewGuid();
        var transaction = Create(owner, DateTimeOffset.UtcNow, true);
        transaction.InitializeBudgetInclusion(household, household ? null : owner);
        Assert.False(transaction.IncludeInHouseholdBudget);
        Assert.Empty(transaction.PersonalBudgetInclusions);
        Assert.True(transaction.IsExcludedFromBudget);
    }

    [Fact]
    public void Changes_RequireInitializationAndAnIdentifiedUser()
    {
        var owner = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;
        var transaction = Create(owner, now);
        Assert.Throws<InvalidOperationException>(() => transaction.SetBudgetInclusionForUser(owner, true, true, now));
        transaction.InitializeBudgetInclusion(true, null);
        Assert.Throws<ArgumentException>(() => transaction.SetBudgetInclusionForUser(Guid.Empty, false, false, now));
        Assert.True(transaction.IncludeInHouseholdBudget);
    }

    private static Transaction Create(Guid user, DateTimeOffset now, bool excluded = false) =>
        Transaction.CreateManual(Guid.NewGuid(), Guid.NewGuid(), null, new DateOnly(2026, 7, 5),
            null, 1200, "Rent", null, null, excluded, user, now);
}
