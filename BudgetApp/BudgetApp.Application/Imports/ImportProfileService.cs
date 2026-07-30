using BudgetApp.Application.Accounts;
using BudgetApp.Application.Auditing;
using BudgetApp.Application.Households;
using BudgetApp.Domain.Auditing;
using BudgetApp.Domain.Imports;

namespace BudgetApp.Application.Imports;

public sealed class ImportProfileService(
    IImportProfileRepository repository,
    IAccountRepository accountRepository,
    ICsvImportReader csvReader,
    HouseholdAuthorizationService authorizationService,
    TimeProvider timeProvider,
    AuditWriter? auditWriter = null)
{
    public async Task<IReadOnlyList<ImportProfileModel>> ListAsync(
        Guid householdId,
        Guid userId,
        bool includeInactive,
        CancellationToken cancellationToken)
    {
        await authorizationService.RequireViewAsync(householdId, userId, cancellationToken);
        return (await repository.ListAsync(
            householdId, includeInactive, cancellationToken))
            .Select(ToModel).ToList();
    }

    public async Task<ImportProfileModel> CreateAsync(
        Guid householdId,
        Guid userId,
        SaveImportProfileInput input,
        CancellationToken cancellationToken)
    {
        await authorizationService.RequireEditAsync(householdId, userId, cancellationToken);
        await ValidateDefaultAccount(
            householdId, userId, input.DefaultAccountId, cancellationToken);
        var profile = CreateProfile(householdId, input);
        if (profile.DefaultAccountId.HasValue)
            await repository.ClearDefaultAccountAsync(
                householdId, profile.DefaultAccountId.Value, profile.Id, cancellationToken);
        await repository.AddAsync(profile, cancellationToken);
        RecordProfileEvent(
            profile,
            userId,
            AuditActions.Created,
            $"Created CSV import profile '{profile.Name}'.");
        await repository.SaveChangesAsync(cancellationToken);
        return ToModel(profile);
    }

    public async Task<ImportProfileModel> UpdateAsync(
        Guid householdId,
        Guid userId,
        Guid profileId,
        SaveImportProfileInput input,
        CancellationToken cancellationToken)
    {
        await authorizationService.RequireEditAsync(householdId, userId, cancellationToken);
        var profile = await repository.GetAsync(
            householdId, profileId, forUpdate: true, cancellationToken)
            ?? throw new ImportProfileNotFoundException();
        var previousName = profile.Name;
        await ValidateDefaultAccount(
            householdId, userId, input.DefaultAccountId, cancellationToken);
        profile.Update(
            input.Name, input.Headers, input.DateColumn, input.DescriptionColumn,
            input.AmountColumn, input.DebitColumn, input.CreditColumn,
            input.CategoryColumn, input.SubcategoryColumn,
            ParseConvention(input.AmountConvention), input.DefaultAccountId,
            timeProvider.GetUtcNow());
        if (profile.DefaultAccountId.HasValue)
            await repository.ClearDefaultAccountAsync(
                householdId, profile.DefaultAccountId.Value, profile.Id, cancellationToken);
        RecordProfileEvent(
            profile,
            userId,
            AuditActions.Updated,
            $"Updated CSV import profile '{profile.Name}'.",
            new Dictionary<string, string?>
            {
                ["Name"] = $"{previousName} → {profile.Name}",
                ["Mapped columns"] = profile.GetHeaders().Count.ToString()
            });
        await repository.SaveChangesAsync(cancellationToken);
        return ToModel(profile);
    }

    public async Task SetActiveAsync(
        Guid householdId,
        Guid userId,
        Guid profileId,
        bool isActive,
        CancellationToken cancellationToken)
    {
        await authorizationService.RequireEditAsync(householdId, userId, cancellationToken);
        var profile = await repository.GetAsync(
            householdId, profileId, forUpdate: true, cancellationToken)
            ?? throw new ImportProfileNotFoundException();
        if (isActive) profile.Reactivate(timeProvider.GetUtcNow());
        else profile.Deactivate(timeProvider.GetUtcNow());
        RecordProfileEvent(
            profile,
            userId,
            isActive ? AuditActions.Activated : AuditActions.Deactivated,
            $"{(isActive ? "Activated" : "Deactivated")} CSV import profile " +
            $"'{profile.Name}'.");
        await repository.SaveChangesAsync(cancellationToken);
    }

    public async Task DeleteAsync(
        Guid householdId,
        Guid userId,
        Guid profileId,
        CancellationToken cancellationToken)
    {
        await authorizationService.RequireEditAsync(householdId, userId, cancellationToken);
        var profile = await repository.GetAsync(
            householdId, profileId, forUpdate: true, cancellationToken)
            ?? throw new ImportProfileNotFoundException();
        if (profile.IsActive)
            throw new InvalidOperationException(
                "Deactivate the import profile before deleting it permanently.");
        RecordProfileEvent(
            profile,
            userId,
            AuditActions.Deleted,
            $"Deleted CSV import profile '{profile.Name}'.");
        repository.Remove(profile);
        await repository.SaveChangesAsync(cancellationToken);
    }

    private void RecordProfileEvent(
        ImportProfile profile,
        Guid actorUserId,
        string action,
        string summary,
        IReadOnlyDictionary<string, string?>? details = null)
    {
        auditWriter?.Record(new AuditEventInput(
            profile.HouseholdId,
            actorUserId,
            AuditVisibility.Household,
            null,
            action,
            AuditEntityTypes.ImportProfile,
            profile.Id,
            summary,
            details));
    }

    public async Task<ImportProfileInspectionModel> InspectAsync(
        Guid householdId,
        Guid userId,
        Guid accountId,
        Stream content,
        CancellationToken cancellationToken)
    {
        await authorizationService.RequireViewAsync(householdId, userId, cancellationToken);
        _ = await accountRepository.GetForUpdateAsync(
            householdId, accountId, cancellationToken)
            ?? throw new AccountNotFoundException();
        var inspection = await csvReader.InspectAsync(content, cancellationToken);
        var match = await repository.FindMatchAsync(
            householdId,
            ImportProfile.BuildHeaderSignature(inspection.Headers),
            accountId,
            cancellationToken);
        return new ImportProfileInspectionModel(
            inspection.Headers,
            inspection.PreviewRows,
            match is null ? null : ToModel(match),
            ToModel(inspection.SuggestedProfile));
    }

    public async Task<(string FileName, string Content)> GetTemplateAsync(
        Guid householdId,
        Guid userId,
        Guid profileId,
        CancellationToken cancellationToken)
    {
        await authorizationService.RequireViewAsync(householdId, userId, cancellationToken);
        var profile = await repository.GetAsync(
            householdId, profileId, forUpdate: false, cancellationToken)
            ?? throw new ImportProfileNotFoundException();
        var content = string.Join(",", profile.GetHeaders().Select(EscapeCsv)) + Environment.NewLine;
        var safeName = string.Concat(profile.Name.Select(character =>
            char.IsLetterOrDigit(character) ? character : '-')).Trim('-');
        return ($"{(safeName.Length == 0 ? "import-profile" : safeName)}.csv", content);
    }

    public async Task<CsvProfileDefinition?> ResolveAsync(
        Guid householdId,
        Guid profileId,
        CancellationToken cancellationToken)
    {
        if (profileId == Guid.Empty) return null;
        var profile = await repository.GetAsync(
            householdId, profileId, forUpdate: false, cancellationToken)
            ?? throw new ImportProfileNotFoundException();
        if (!profile.IsActive)
            throw new InvalidOperationException("The selected import profile is deactivated.");
        return ToDefinition(profile);
    }

    public async Task<CsvProfileDefinition?> DetectAsync(
        Guid householdId,
        Guid accountId,
        IReadOnlyList<string> headers,
        CancellationToken cancellationToken)
    {
        var profile = await repository.FindMatchAsync(
            householdId, ImportProfile.BuildHeaderSignature(headers),
            accountId, cancellationToken);
        return profile is null ? null : ToDefinition(profile);
    }

    private async Task ValidateDefaultAccount(
        Guid householdId,
        Guid userId,
        Guid? accountId,
        CancellationToken cancellationToken)
    {
        if (!accountId.HasValue) return;
        var visible = await accountRepository.ListVisibleAsync(
            householdId, userId, cancellationToken);
        if (visible.All(account => account.Id != accountId.Value))
            throw new AccountNotFoundException();
    }

    private ImportProfile CreateProfile(Guid householdId, SaveImportProfileInput input) =>
        ImportProfile.Create(
            householdId, input.Name, input.Headers, input.DateColumn,
            input.DescriptionColumn, input.AmountColumn, input.DebitColumn,
            input.CreditColumn, input.CategoryColumn, input.SubcategoryColumn,
            ParseConvention(input.AmountConvention), input.DefaultAccountId,
            timeProvider.GetUtcNow());

    private static ImportAmountConvention ParseConvention(string value) =>
        Enum.TryParse<ImportAmountConvention>(value, true, out var parsed) &&
        Enum.IsDefined(parsed)
            ? parsed
            : throw new ArgumentException(
                "Amount convention must be SpendingPositive or MoneyInPositive.");

    private static ImportProfileModel ToModel(ImportProfile profile) =>
        new(
            profile.Id, profile.Name, profile.GetHeaders(), profile.DateColumn,
            profile.DescriptionColumn, profile.AmountColumn, profile.DebitColumn,
            profile.CreditColumn, profile.CategoryColumn, profile.SubcategoryColumn,
            profile.AmountConvention.ToString(), profile.DefaultAccountId, profile.IsActive);

    private static ImportProfileModel ToModel(CsvProfileDefinition profile) =>
        new(
            profile.Id ?? Guid.Empty, profile.Name, profile.Headers,
            profile.DateColumn, profile.DescriptionColumn, profile.AmountColumn,
            profile.DebitColumn, profile.CreditColumn, profile.CategoryColumn,
            profile.SubcategoryColumn, profile.AmountConvention.ToString(), null, true);

    private static CsvProfileDefinition ToDefinition(ImportProfile profile) =>
        new(
            profile.Id, profile.Name, profile.GetHeaders(), profile.DateColumn,
            profile.DescriptionColumn, profile.AmountColumn, profile.DebitColumn,
            profile.CreditColumn, profile.CategoryColumn, profile.SubcategoryColumn,
            profile.AmountConvention);

    private static string EscapeCsv(string value) =>
        value.Contains(',') || value.Contains('"') || value.Contains('\n')
            ? $"\"{value.Replace("\"", "\"\"")}\""
            : value;
}

public sealed class ImportProfileNotFoundException : Exception;
