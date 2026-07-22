namespace BudgetApp.Application.Imports;

public sealed class CsvImportRejectedException(string message)
    : Exception(message);
