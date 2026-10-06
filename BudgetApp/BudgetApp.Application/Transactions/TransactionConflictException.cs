namespace BudgetApp.Application.Transactions;

public sealed class TransactionConflictException()
    : InvalidOperationException("This transaction changed elsewhere. Reload it before saving.");
