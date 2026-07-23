namespace BudgetApp.Application.RecurringExpenses;

public sealed class RecurringExpenseNotFoundException : Exception
{
    public RecurringExpenseNotFoundException()
        : base("The recurring expense was not found.")
    {
    }
}
