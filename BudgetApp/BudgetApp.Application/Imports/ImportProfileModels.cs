using BudgetApp.Domain.Imports;

namespace BudgetApp.Application.Imports;

public sealed record ImportProfileModel(
    Guid Id,
    string Name,
    IReadOnlyList<string> Headers,
    string DateColumn,
    string DescriptionColumn,
    string? AmountColumn,
    string? DebitColumn,
    string? CreditColumn,
    string? CategoryColumn,
    string? SubcategoryColumn,
    string AmountConvention,
    Guid? DefaultAccountId,
    bool IsActive,
    string? DateFormat = null,
    string? NumberCulture = null);

public sealed record SaveImportProfileInput(
    string Name,
    IReadOnlyList<string> Headers,
    string DateColumn,
    string DescriptionColumn,
    string? AmountColumn,
    string? DebitColumn,
    string? CreditColumn,
    string? CategoryColumn,
    string? SubcategoryColumn,
    string AmountConvention,
    Guid? DefaultAccountId,
    string? DateFormat = null,
    string? NumberCulture = null);

public sealed record ImportProfileDefinition(
    Guid? Id,
    string Name,
    IReadOnlyList<string> Headers,
    string DateColumn,
    string DescriptionColumn,
    string? AmountColumn,
    string? DebitColumn,
    string? CreditColumn,
    string? CategoryColumn,
    string? SubcategoryColumn,
    ImportAmountConvention AmountConvention,
    string? DateFormat = null,
    string? NumberCulture = null);

public sealed record TransactionImportInspection(
    long FileSizeBytes,
    string Sha256Hash,
    IReadOnlyList<string> Headers,
    IReadOnlyList<IReadOnlyList<string>> PreviewRows,
    ImportProfileDefinition? SuggestedProfile,
    IReadOnlyList<ImportWorksheetOption>? Worksheets = null,
    string? SelectedWorksheetId = null,
    string? SelectedWorksheetName = null,
    IReadOnlyList<int>? PreviewRowNumbers = null);

public sealed record ImportProfileInspectionModel(
    IReadOnlyList<string> Headers,
    IReadOnlyList<IReadOnlyList<string>> PreviewRows,
    ImportProfileModel? MatchedProfile,
    ImportProfileModel? SuggestedProfile,
    IReadOnlyList<ImportWorksheetOption>? Worksheets = null,
    string? SelectedWorksheetId = null,
    string? SelectedWorksheetName = null,
    IReadOnlyList<int>? PreviewRowNumbers = null);
