using BudgetApp.Domain.Budgeting;

namespace BudgetApp.Tests.Domain.Budgeting;

public sealed class BudgetMonthTests
{
    [Fact]
    public void CreateHousehold_CreatesDraftWithCurrencySnapshot()
    {
        var householdId = Guid.NewGuid();
        var createdAtUtc = DateTimeOffset.UtcNow;

        var budget = BudgetMonth.CreateHousehold(
            householdId,
            2026,
            7,
            " cad ",
            createdAtUtc);

        Assert.Equal(householdId, budget.HouseholdId);
        Assert.Equal(2026, budget.Year);
        Assert.Equal(7, budget.Month);
        Assert.Equal(BudgetScope.Household, budget.Scope);
        Assert.Null(budget.OwnerUserId);
        Assert.Equal("CAD", budget.Currency);
        Assert.Equal(BudgetStatus.Draft, budget.Status);
        Assert.Empty(budget.Lines);
    }

    [Fact]
    public void CreatePersonal_RequiresAndStoresOwner()
    {
        var ownerUserId = Guid.NewGuid();

        var budget = BudgetMonth.CreatePersonal(
            Guid.NewGuid(),
            ownerUserId,
            2026,
            8,
            "USD",
            DateTimeOffset.UtcNow);

        Assert.Equal(BudgetScope.Personal, budget.Scope);
        Assert.Equal(ownerUserId, budget.OwnerUserId);

        Assert.Throws<ArgumentException>(() => BudgetMonth.CreatePersonal(
            Guid.NewGuid(),
            Guid.Empty,
            2026,
            8,
            "USD",
            DateTimeOffset.UtcNow));
    }

    [Theory]
    [InlineData(0, 1)]
    [InlineData(10000, 1)]
    [InlineData(2026, 0)]
    [InlineData(2026, 13)]
    public void Create_RejectsInvalidCalendarMonth(int year, int month)
    {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            BudgetMonth.CreateHousehold(
                Guid.NewGuid(),
                year,
                month,
                "CAD",
                DateTimeOffset.UtcNow));
    }

    [Theory]
    [InlineData("CA")]
    [InlineData("C4D")]
    [InlineData("CANADIAN")]
    public void Create_RejectsInvalidCurrency(string currency)
    {
        Assert.Throws<ArgumentException>(() => BudgetMonth.CreateHousehold(
            Guid.NewGuid(),
            2026,
            7,
            currency,
            DateTimeOffset.UtcNow));
    }

    [Fact]
    public void Lines_SupportZeroAmountsAndMultipleBudgetSections()
    {
        var budget = CreateBudget();
        var foodCategoryId = Guid.NewGuid();
        var entertainmentCategoryId = Guid.NewGuid();

        var foodLine = budget.AddLine(foodCategoryId, 250m, DateTimeOffset.UtcNow);
        var entertainmentLine = budget.AddLine(
            entertainmentCategoryId,
            0m,
            DateTimeOffset.UtcNow);

        Assert.Equal(250m, foodLine.BudgetedAmount);
        Assert.Equal(0m, entertainmentLine.BudgetedAmount);
        Assert.Equal(2, budget.Lines.Count);
    }

    [Fact]
    public void Lines_CanBeUpdatedAndRemovedWhileBudgetIsOpen()
    {
        var budget = CreateBudget();
        var categoryId = Guid.NewGuid();
        var updatedAtUtc = DateTimeOffset.UtcNow.AddMinutes(1);
        budget.AddLine(categoryId, 100m, DateTimeOffset.UtcNow);

        budget.UpdateLineAmount(categoryId, 125.50m, updatedAtUtc);

        Assert.Equal(125.50m, Assert.Single(budget.Lines).BudgetedAmount);
        Assert.Equal(updatedAtUtc, budget.UpdatedAtUtc);

        budget.RemoveLine(categoryId, updatedAtUtc.AddMinutes(1));
        Assert.Empty(budget.Lines);
    }

    [Fact]
    public void AddLine_RejectsDuplicateCategoryAndInvalidAmounts()
    {
        var budget = CreateBudget();
        var categoryId = Guid.NewGuid();
        budget.AddLine(categoryId, 100m, DateTimeOffset.UtcNow);

        Assert.Throws<InvalidOperationException>(() =>
            budget.AddLine(categoryId, 200m, DateTimeOffset.UtcNow));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            budget.AddLine(Guid.NewGuid(), -1m, DateTimeOffset.UtcNow));
        Assert.Throws<ArgumentException>(() =>
            budget.AddLine(Guid.NewGuid(), 1.00001m, DateTimeOffset.UtcNow));
    }

    [Fact]
    public void StatusTransitions_CloseAndLockBudget()
    {
        var budget = CreateBudget();
        var categoryId = Guid.NewGuid();
        budget.AddLine(categoryId, 100m, DateTimeOffset.UtcNow);

        budget.Activate(DateTimeOffset.UtcNow.AddMinutes(1));
        budget.UpdateLineAmount(categoryId, 125m, DateTimeOffset.UtcNow.AddMinutes(2));
        budget.Close(DateTimeOffset.UtcNow.AddMinutes(3));

        Assert.Equal(BudgetStatus.Closed, budget.Status);
        Assert.Throws<InvalidOperationException>(() =>
            budget.UpdateLineAmount(categoryId, 150m, DateTimeOffset.UtcNow));
        Assert.Throws<InvalidOperationException>(() =>
            budget.AddLine(Guid.NewGuid(), 50m, DateTimeOffset.UtcNow));
        Assert.Throws<InvalidOperationException>(() =>
            budget.RemoveLine(categoryId, DateTimeOffset.UtcNow));
    }

    [Fact]
    public void Reopen_ChangesClosedBudgetBackToActive()
    {
        var budget = CreateBudget();
        budget.Activate(DateTimeOffset.UtcNow);
        budget.Close(DateTimeOffset.UtcNow.AddMinutes(1));

        budget.Reopen(DateTimeOffset.UtcNow.AddMinutes(2));

        Assert.Equal(BudgetStatus.Active, budget.Status);
        budget.AddLine(Guid.NewGuid(), 50m, DateTimeOffset.UtcNow.AddMinutes(3));
        Assert.Throws<InvalidOperationException>(() =>
            budget.Reopen(DateTimeOffset.UtcNow.AddMinutes(4)));
    }

    private static BudgetMonth CreateBudget() =>
        BudgetMonth.CreateHousehold(
            Guid.NewGuid(),
            2026,
            7,
            "CAD",
            DateTimeOffset.UtcNow);
}
