namespace BudgetApp.Application.Imports;

public sealed class DuplicateCsvImportException()
    : Exception(
        "This account already has an import with the same file contents. " +
        "Confirm that you want to import it again.");
