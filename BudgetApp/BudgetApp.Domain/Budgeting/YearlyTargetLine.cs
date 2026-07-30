namespace BudgetApp.Domain.Budgeting;

public sealed class YearlyTargetLine
{
    public const decimal MaximumAnnualTargetAmount =
        9_999_999_999_999_999.99m;

    private YearlyTargetLine()
    {
    }

    private YearlyTargetLine(
        Guid yearlyPlanId,
        Guid categoryId,
        decimal annualTargetAmount,
        DateTimeOffset createdAtUtc)
    {
        if (yearlyPlanId == Guid.Empty)
            throw new ArgumentException("Yearly plan ID is required.", nameof(yearlyPlanId));
        if (categoryId == Guid.Empty)
            throw new ArgumentException("Category ID is required.", nameof(categoryId));
        Id = Guid.NewGuid();
        YearlyPlanId = yearlyPlanId;
        CategoryId = categoryId;
        SetAmount(annualTargetAmount);
        CreatedAtUtc = createdAtUtc;
        UpdatedAtUtc = createdAtUtc;
    }

    public Guid Id { get; private set; }

    public Guid YearlyPlanId { get; private set; }

    public Guid CategoryId { get; private set; }

    public decimal AnnualTargetAmount { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; }

    public DateTimeOffset UpdatedAtUtc { get; private set; }

    internal static YearlyTargetLine Create(
        Guid yearlyPlanId,
        Guid categoryId,
        decimal annualTargetAmount,
        DateTimeOffset createdAtUtc) =>
        new(yearlyPlanId, categoryId, annualTargetAmount, createdAtUtc);

    internal void UpdateAmount(decimal annualTargetAmount, DateTimeOffset updatedAtUtc)
    {
        SetAmount(annualTargetAmount);
        UpdatedAtUtc = updatedAtUtc;
    }

    private void SetAmount(decimal annualTargetAmount)
    {
        if (annualTargetAmount < 0 ||
            annualTargetAmount > MaximumAnnualTargetAmount)
        {
            throw new ArgumentOutOfRangeException(
                nameof(annualTargetAmount),
                $"Annual target amounts must be between 0 and " +
                $"{MaximumAnnualTargetAmount}.");
        }

        if (decimal.Round(annualTargetAmount, 2) != annualTargetAmount)
        {
            throw new ArgumentException(
                "Annual target amounts cannot contain more than two decimal places.",
                nameof(annualTargetAmount));
        }

        AnnualTargetAmount = annualTargetAmount;
    }
}
