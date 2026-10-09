namespace BudgetApp.Infrastructure.Imports;

public static class XlsxImportLimits
{
    public const long MaxExpandedBytes = 100 * 1024 * 1024;
    public const long MaxPartBytes = 32 * 1024 * 1024;
    public const long MaxMetadataBytes = 1024 * 1024;
    public const int MaxEntries = 512;
    public const int MaxWorksheets = 20;
    public const int MaxColumns = 100;
    public const int MaxCellCharacters = 4096;
    public const int MaxSharedStrings = 100_000;
    public const int MaxSharedStringCharacters = 2_000_000;
    public const int MaxDecodedCells = 500_000;
    public const int MaxPhysicalRowsPerSheet = 20_000;
    public const int MaxStyles = 4096;
    public const int MaxSelectedCharacters = 5_000_000;
    public const int MaxReadSeconds = 15;
}
