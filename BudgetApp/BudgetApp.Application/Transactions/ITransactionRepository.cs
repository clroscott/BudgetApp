using BudgetApp.Domain.Transactions;

namespace BudgetApp.Application.Transactions;

public interface ITransactionRepository
{
    Task<IReadOnlyList<TransactionRecord>> ListVisibleAsync(
        Guid householdId,
        Guid userId,
        Guid? accountId,
        DateOnly? fromDate,
        DateOnly? toDate,
        int take,
        CancellationToken cancellationToken);

    Task<TransactionAccessRecord?> GetForUpdateAsync(
        Guid householdId,
        Guid transactionId,
        CancellationToken cancellationToken);

    Task SaveChangesAsync(CancellationToken cancellationToken);
}

public sealed record TransactionAccessRecord(
    Transaction Transaction,
    bool IsPersonalAccount,
    Guid? AccountOwnerUserId);
