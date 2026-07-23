using BudgetApp.Domain.RecurringExpenses;

namespace BudgetApp.Tests.Domain.RecurringExpenses;

public sealed class RecurringExpenseTests
{
    [Fact]
    public void CreateHousehold_NormalizesAndStoresMonthlyExpectation()
    {
        var expense = RecurringExpense.CreateHousehold(
            Guid.NewGuid(),
            " Netflix ",
            22.99m,
            " cad ",
            Guid.NewGuid(),
            accountId: null,
            expectedDayOfMonth: 15,
            startsOn: new DateOnly(2026, 1, 1),
            endsOn: null,
            createdAtUtc: DateTimeOffset.UtcNow);

        Assert.Equal("Netflix", expense.Name);
        Assert.Equal(22.99m, expense.Amount);
        Assert.Equal("CAD", expense.Currency);
        Assert.Equal(RecurringExpenseScope.Household, expense.Scope);
        Assert.Null(expense.OwnerUserId);
        Assert.True(expense.IsActive);
        Assert.True(expense.AppliesTo(2026, 7));
        Assert.Equal(new DateOnly(2026, 7, 15), expense.GetExpectedDate(2026, 7));
    }

    [Fact]
    public void PersonalExpense_RequiresOwner()
    {
        Assert.Throws<ArgumentException>(() => RecurringExpense.CreatePersonal(
            Guid.NewGuid(),
            Guid.Empty,
            "Rent",
            1800m,
            "CAD",
            Guid.NewGuid(),
            null,
            1,
            new DateOnly(2026, 1, 1),
            null,
            DateTimeOffset.UtcNow));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(32)]
    public void ExpectedDay_MustBeValid(int day)
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => CreateExpense(
            expectedDayOfMonth: day));
    }

    [Fact]
    public void Amount_MustBePositive()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => CreateExpense(amount: 0));
        Assert.Throws<ArgumentOutOfRangeException>(() => CreateExpense(amount: -1));
    }

    [Fact]
    public void EndDate_CannotPrecedeStartDate()
    {
        Assert.Throws<ArgumentException>(() => RecurringExpense.CreateHousehold(
            Guid.NewGuid(),
            "Rent",
            1800m,
            "CAD",
            Guid.NewGuid(),
            null,
            1,
            new DateOnly(2026, 6, 1),
            new DateOnly(2026, 5, 31),
            DateTimeOffset.UtcNow));
    }

    [Fact]
    public void ExpectedDay_UsesLastDayOfShortMonth()
    {
        var expense = CreateExpense(expectedDayOfMonth: 31);

        Assert.Equal(new DateOnly(2026, 2, 28), expense.GetExpectedDate(2026, 2));
        Assert.Equal(new DateOnly(2028, 2, 29), expense.GetExpectedDate(2028, 2));
    }

    [Fact]
    public void AppliesTo_UsesDateRangeAndActiveState()
    {
        var expense = RecurringExpense.CreateHousehold(
            Guid.NewGuid(),
            "Seasonal service",
            50m,
            "CAD",
            Guid.NewGuid(),
            null,
            null,
            new DateOnly(2026, 3, 15),
            new DateOnly(2026, 5, 10),
            DateTimeOffset.UtcNow);

        Assert.False(expense.AppliesTo(2026, 2));
        Assert.True(expense.AppliesTo(2026, 3));
        Assert.True(expense.AppliesTo(2026, 5));
        Assert.False(expense.AppliesTo(2026, 6));

        expense.Deactivate(DateTimeOffset.UtcNow);
        Assert.False(expense.AppliesTo(2026, 4));
        expense.Reactivate(DateTimeOffset.UtcNow);
        Assert.True(expense.AppliesTo(2026, 4));
    }

    private static RecurringExpense CreateExpense(
        decimal amount = 25m,
        int? expectedDayOfMonth = 1) =>
        RecurringExpense.CreateHousehold(
            Guid.NewGuid(),
            "Monthly expense",
            amount,
            "CAD",
            Guid.NewGuid(),
            null,
            expectedDayOfMonth,
            new DateOnly(2026, 1, 1),
            null,
            DateTimeOffset.UtcNow);
}
