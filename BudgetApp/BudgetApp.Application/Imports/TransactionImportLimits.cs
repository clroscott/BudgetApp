namespace BudgetApp.Application.Imports;

public static class TransactionImportLimits
{
    public const long MaxFileSizeBytes = 10 * 1024 * 1024;
    public const long MaxRequestSizeBytes = MaxFileSizeBytes + (1024 * 1024);
    public const int MaxRows = 10_000;
}
