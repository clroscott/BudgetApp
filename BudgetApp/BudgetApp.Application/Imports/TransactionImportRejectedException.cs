namespace BudgetApp.Application.Imports;

public sealed class TransactionImportRejectedException(string message)
    : Exception(message);
