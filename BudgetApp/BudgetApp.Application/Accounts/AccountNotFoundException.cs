namespace BudgetApp.Application.Accounts;

public sealed class AccountNotFoundException()
    : Exception("The account was not found.");
