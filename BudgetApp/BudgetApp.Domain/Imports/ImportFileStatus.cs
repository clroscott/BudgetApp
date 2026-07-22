namespace BudgetApp.Domain.Imports;

public enum ImportFileStatus
{
    Uploaded = 1,
    Processing = 2,
    ReadyForReview = 3,
    Completed = 4,
    Failed = 5
}
