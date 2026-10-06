namespace BudgetApp.Domain.Transactions;

// A personal inclusion belongs to a user, never to whoever happens to view the row.
public sealed class TransactionPersonalBudgetInclusion
{
    private TransactionPersonalBudgetInclusion() { }

    internal TransactionPersonalBudgetInclusion(Guid transactionId, Guid userId)
    {
        if (userId == Guid.Empty) throw new ArgumentException("A personal budget user is required.");
        TransactionId = transactionId;
        UserId = userId;
    }

    public Guid TransactionId { get; private set; }
    public Guid UserId { get; private set; }
}
