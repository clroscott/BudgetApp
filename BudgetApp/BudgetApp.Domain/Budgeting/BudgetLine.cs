namespace BudgetApp.Domain.Budgeting;

public sealed class BudgetLine
{
    public const decimal MaximumBudgetedAmount = 999_999_999_999_999.9999m;

    private BudgetLine()
    {
    }

    private BudgetLine(
        Guid id,
        Guid budgetMonthId,
        Guid categoryId,
        decimal budgetedAmount,
        DateTimeOffset createdAtUtc)
    {
        Id = id;
        BudgetMonthId = ValidateRequiredId(
            budgetMonthId,
            nameof(budgetMonthId),
            "Budget month ID");
        CategoryId = ValidateRequiredId(
            categoryId,
            nameof(categoryId),
            "Category ID");
        BudgetedAmount = ValidateAmount(budgetedAmount);
        CreatedAtUtc = createdAtUtc;
        UpdatedAtUtc = createdAtUtc;
    }

    public Guid Id { get; private set; }

    public Guid BudgetMonthId { get; private set; }

    public Guid CategoryId { get; private set; }

    public decimal BudgetedAmount { get; private set; }

    public DateTimeOffset CreatedAtUtc { get; private set; }

    public DateTimeOffset UpdatedAtUtc { get; private set; }

    internal static BudgetLine Create(
        Guid budgetMonthId,
        Guid categoryId,
        decimal budgetedAmount,
        DateTimeOffset createdAtUtc) =>
        new(
            Guid.NewGuid(),
            budgetMonthId,
            categoryId,
            budgetedAmount,
            createdAtUtc);

    internal void UpdateAmount(
        decimal budgetedAmount,
        DateTimeOffset updatedAtUtc)
    {
        BudgetedAmount = ValidateAmount(budgetedAmount);
        UpdatedAtUtc = updatedAtUtc;
    }

    private static decimal ValidateAmount(decimal budgetedAmount)
    {
        if (budgetedAmount < 0 || budgetedAmount > MaximumBudgetedAmount)
        {
            throw new ArgumentOutOfRangeException(
                nameof(budgetedAmount),
                $"Budgeted amount must be between 0 and {MaximumBudgetedAmount}.");
        }

        if (decimal.Round(budgetedAmount, 4) != budgetedAmount)
        {
            throw new ArgumentException(
                "Budgeted amount cannot contain more than four decimal places.",
                nameof(budgetedAmount));
        }

        return budgetedAmount;
    }

    private static Guid ValidateRequiredId(
        Guid value,
        string parameterName,
        string displayName)
    {
        if (value == Guid.Empty)
        {
            throw new ArgumentException($"{displayName} is required.", parameterName);
        }

        return value;
    }
}
