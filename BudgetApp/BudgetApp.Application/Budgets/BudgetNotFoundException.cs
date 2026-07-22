namespace BudgetApp.Application.Budgets;

public sealed class BudgetNotFoundException : Exception
{
    public BudgetNotFoundException() : base("The budget month was not found.")
    {
    }
}
