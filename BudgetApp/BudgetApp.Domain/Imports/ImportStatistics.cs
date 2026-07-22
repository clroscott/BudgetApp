namespace BudgetApp.Domain.Imports;

public readonly record struct ImportStatistics
{
    public ImportStatistics(
        int totalRows,
        int validRows,
        int invalidRows,
        int approvedRows,
        int rejectedRows,
        int skippedRows,
        int duplicateRows)
    {
        ValidateNonNegative(totalRows, nameof(totalRows));
        ValidateNonNegative(validRows, nameof(validRows));
        ValidateNonNegative(invalidRows, nameof(invalidRows));
        ValidateNonNegative(approvedRows, nameof(approvedRows));
        ValidateNonNegative(rejectedRows, nameof(rejectedRows));
        ValidateNonNegative(skippedRows, nameof(skippedRows));
        ValidateNonNegative(duplicateRows, nameof(duplicateRows));

        if ((long)validRows + invalidRows != totalRows)
        {
            throw new ArgumentException(
                "Valid and invalid row counts must add up to the total row count.");
        }

        if (approvedRows > validRows)
        {
            throw new ArgumentException(
                "Approved row count cannot exceed valid row count.",
                nameof(approvedRows));
        }

        if ((long)approvedRows + rejectedRows + skippedRows > totalRows)
        {
            throw new ArgumentException(
                "Reviewed row counts cannot exceed total row count.");
        }

        if (duplicateRows > totalRows)
        {
            throw new ArgumentException(
                "Duplicate row count cannot exceed total row count.",
                nameof(duplicateRows));
        }

        TotalRows = totalRows;
        ValidRows = validRows;
        InvalidRows = invalidRows;
        ApprovedRows = approvedRows;
        RejectedRows = rejectedRows;
        SkippedRows = skippedRows;
        DuplicateRows = duplicateRows;
    }

    public int TotalRows { get; }

    public int ValidRows { get; }

    public int InvalidRows { get; }

    public int ApprovedRows { get; }

    public int RejectedRows { get; }

    public int SkippedRows { get; }

    public int DuplicateRows { get; }

    public int PendingRows => TotalRows - ApprovedRows - RejectedRows - SkippedRows;

    private static void ValidateNonNegative(int value, string parameterName)
    {
        if (value < 0)
        {
            throw new ArgumentOutOfRangeException(
                parameterName,
                "Import row counts cannot be negative.");
        }
    }
}
