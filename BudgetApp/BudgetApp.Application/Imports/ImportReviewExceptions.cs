namespace BudgetApp.Application.Imports;

public sealed class ImportNotFoundException()
    : Exception("Import was not found.");

public sealed class ImportDraftNotFoundException()
    : Exception("Import row was not found.");
