namespace BudgetApp.Application.Imports;

public sealed class DuplicateImportFileException()
    : Exception(
        "This account already has an import with the same file contents. " +
        "Confirm that you want to import it again.");
