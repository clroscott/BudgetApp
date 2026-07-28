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
    bool IsActive);

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
    Guid? DefaultAccountId);

public sealed record CsvProfileDefinition(
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
    ImportAmountConvention AmountConvention);

public sealed record CsvStructureInspection(
    long FileSizeBytes,
    string Sha256Hash,
    IReadOnlyList<string> Headers,
    IReadOnlyList<IReadOnlyList<string>> PreviewRows,
    CsvProfileDefinition SuggestedProfile);

public sealed record ImportProfileInspectionModel(
    IReadOnlyList<string> Headers,
    IReadOnlyList<IReadOnlyList<string>> PreviewRows,
    ImportProfileModel? MatchedProfile,
    ImportProfileModel SuggestedProfile);
