namespace BudgetApp.Application.Transactions;

public sealed class TransactionNotFoundException()
    : Exception("Transaction was not found.");
