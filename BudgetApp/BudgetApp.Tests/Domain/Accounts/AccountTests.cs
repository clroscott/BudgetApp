using BudgetApp.Domain.Accounts;

namespace BudgetApp.Tests.Domain.Accounts;

public sealed class AccountTests
{
    [Fact]
    public void CreateHousehold_CreatesActiveSharedAccount()
    {
        var householdId = Guid.NewGuid();
        var createdAtUtc = new DateTimeOffset(2026, 7, 22, 12, 0, 0, TimeSpan.Zero);

        var account = Account.CreateHousehold(
            householdId,
            "  Joint Chequing  ",
            AccountType.Chequing,
            "cad",
            "  Example Credit Union  ",
            " 1234 ",
            createdAtUtc);

        Assert.NotEqual(Guid.Empty, account.Id);
        Assert.Equal(householdId, account.HouseholdId);
        Assert.Equal("Joint Chequing", account.Name);
        Assert.Equal(AccountType.Chequing, account.Type);
        Assert.Equal(AccountScope.Household, account.Scope);
        Assert.Null(account.OwnerUserId);
        Assert.Equal("CAD", account.Currency);
        Assert.Equal("Example Credit Union", account.InstitutionName);
        Assert.Equal("1234", account.LastFourDigits);
        Assert.True(account.IsActive);
        Assert.Equal(createdAtUtc, account.CreatedAtUtc);
        Assert.Equal(createdAtUtc, account.UpdatedAtUtc);
    }

    [Fact]
    public void CreatePersonal_RequiresAndStoresOwner()
    {
        var ownerUserId = Guid.NewGuid();

        var account = Account.CreatePersonal(
            Guid.NewGuid(),
            ownerUserId,
            "My Savings",
            AccountType.Savings,
            "CAD",
            institutionName: "   ",
            lastFourDigits: null,
            DateTimeOffset.UtcNow);

        Assert.Equal(AccountScope.Personal, account.Scope);
        Assert.Equal(ownerUserId, account.OwnerUserId);
        Assert.Null(account.InstitutionName);
        Assert.Null(account.LastFourDigits);
    }

    [Fact]
    public void UpdateDetails_DoesNotChangeFinancialOwnership()
    {
        var householdId = Guid.NewGuid();
        var ownerUserId = Guid.NewGuid();
        var account = Account.CreatePersonal(
            householdId,
            ownerUserId,
            "Chequing",
            AccountType.Chequing,
            "CAD",
            null,
            null,
            DateTimeOffset.UtcNow);
        var updatedAtUtc = DateTimeOffset.UtcNow.AddMinutes(1);

        account.UpdateDetails(
            "Daily Chequing",
            AccountType.Other,
            "New Institution",
            "9876",
            updatedAtUtc);

        Assert.Equal("Daily Chequing", account.Name);
        Assert.Equal(AccountType.Other, account.Type);
        Assert.Equal("New Institution", account.InstitutionName);
        Assert.Equal("9876", account.LastFourDigits);
        Assert.Equal(householdId, account.HouseholdId);
        Assert.Equal(AccountScope.Personal, account.Scope);
        Assert.Equal(ownerUserId, account.OwnerUserId);
        Assert.Equal("CAD", account.Currency);
        Assert.Equal(updatedAtUtc, account.UpdatedAtUtc);
    }

    [Fact]
    public void UpdateFinancialSettings_ChangesScopeOwnerAndCurrencyTogether()
    {
        var account = CreateHouseholdAccount();
        var ownerUserId = Guid.NewGuid();
        var updatedAtUtc = DateTimeOffset.UtcNow.AddMinutes(1);

        account.UpdateFinancialSettings(
            AccountScope.Personal,
            ownerUserId,
            "usd",
            updatedAtUtc);

        Assert.Equal(AccountScope.Personal, account.Scope);
        Assert.Equal(ownerUserId, account.OwnerUserId);
        Assert.Equal("USD", account.Currency);
        Assert.Equal(updatedAtUtc, account.UpdatedAtUtc);

        account.UpdateFinancialSettings(
            AccountScope.Household,
            null,
            "CAD",
            updatedAtUtc.AddMinutes(1));

        Assert.Equal(AccountScope.Household, account.Scope);
        Assert.Null(account.OwnerUserId);
        Assert.Equal("CAD", account.Currency);
    }

    [Fact]
    public void UpdateFinancialSettings_RejectsScopeOwnerMismatch()
    {
        var account = CreateHouseholdAccount();

        Assert.Throws<ArgumentException>(() => account.UpdateFinancialSettings(
            AccountScope.Personal,
            null,
            "CAD",
            DateTimeOffset.UtcNow));
        Assert.Throws<ArgumentException>(() => account.UpdateFinancialSettings(
            AccountScope.Household,
            Guid.NewGuid(),
            "CAD",
            DateTimeOffset.UtcNow));
    }

    [Fact]
    public void ArchiveAndReactivate_PreserveAccountHistory()
    {
        var account = CreateHouseholdAccount();
        var archivedAtUtc = DateTimeOffset.UtcNow.AddMinutes(1);
        var reactivatedAtUtc = archivedAtUtc.AddMinutes(1);

        account.Archive(archivedAtUtc);

        Assert.False(account.IsActive);
        Assert.Equal(archivedAtUtc, account.UpdatedAtUtc);

        account.Reactivate(reactivatedAtUtc);

        Assert.True(account.IsActive);
        Assert.Equal(reactivatedAtUtc, account.UpdatedAtUtc);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Create_RejectsMissingName(string name)
    {
        var exception = Assert.Throws<ArgumentException>(() =>
            Account.CreateHousehold(
                Guid.NewGuid(),
                name,
                AccountType.Cash,
                "CAD",
                null,
                null,
                DateTimeOffset.UtcNow));

        Assert.Equal("name", exception.ParamName);
    }

    [Theory]
    [InlineData("CA")]
    [InlineData("C4D")]
    [InlineData("CANADIAN")]
    public void Create_RejectsInvalidCurrency(string currency)
    {
        var exception = Assert.Throws<ArgumentException>(() =>
            Account.CreateHousehold(
                Guid.NewGuid(),
                "Cash",
                AccountType.Cash,
                currency,
                null,
                null,
                DateTimeOffset.UtcNow));

        Assert.Equal("currency", exception.ParamName);
    }

    [Theory]
    [InlineData("123")]
    [InlineData("12345")]
    [InlineData("12A4")]
    public void Create_RejectsInvalidLastFourDigits(string lastFourDigits)
    {
        var exception = Assert.Throws<ArgumentException>(() =>
            Account.CreateHousehold(
                Guid.NewGuid(),
                "Credit Card",
                AccountType.CreditCard,
                "CAD",
                null,
                lastFourDigits,
                DateTimeOffset.UtcNow));

        Assert.Equal("lastFourDigits", exception.ParamName);
    }

    [Fact]
    public void CreatePersonal_RejectsMissingOwner()
    {
        var exception = Assert.Throws<ArgumentException>(() =>
            Account.CreatePersonal(
                Guid.NewGuid(),
                Guid.Empty,
                "My Chequing",
                AccountType.Chequing,
                "CAD",
                null,
                null,
                DateTimeOffset.UtcNow));

        Assert.Equal("ownerUserId", exception.ParamName);
    }

    [Fact]
    public void Create_RejectsUnsupportedType()
    {
        var exception = Assert.Throws<ArgumentOutOfRangeException>(() =>
            Account.CreateHousehold(
                Guid.NewGuid(),
                "Unknown",
                (AccountType)999,
                "CAD",
                null,
                null,
                DateTimeOffset.UtcNow));

        Assert.Equal("type", exception.ParamName);
    }

    private static Account CreateHouseholdAccount() =>
        Account.CreateHousehold(
            Guid.NewGuid(),
            "Cash",
            AccountType.Cash,
            "CAD",
            null,
            null,
            DateTimeOffset.UtcNow);
}
