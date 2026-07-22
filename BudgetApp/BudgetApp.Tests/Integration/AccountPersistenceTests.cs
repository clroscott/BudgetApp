using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.Households;
using BudgetApp.Infrastructure.Data;
using BudgetApp.Infrastructure.Identity;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Tests.Integration;

public sealed class AccountPersistenceTests
{
    [Fact]
    public async Task HouseholdAndPersonalAccounts_CanBeSavedAndLoaded()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();

        await using var context = CreateContext(connection);
        var (household, ownerUserId) = await AddHousehold(context);
        var createdAtUtc = DateTimeOffset.UtcNow;
        var householdAccount = Account.CreateHousehold(
            household.Id,
            "Joint Chequing",
            AccountType.Chequing,
            "CAD",
            "Example Credit Union",
            "1234",
            createdAtUtc);
        var personalAccount = Account.CreatePersonal(
            household.Id,
            ownerUserId,
            "Personal Credit Card",
            AccountType.CreditCard,
            "CAD",
            "Example Bank",
            "9876",
            createdAtUtc);

        context.Accounts.AddRange(householdAccount, personalAccount);
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();

        var saved = await context.Accounts
            .Where(account => account.HouseholdId == household.Id)
            .OrderBy(account => account.Name)
            .ToListAsync();

        Assert.Equal(2, saved.Count);
        var savedHouseholdAccount = Assert.Single(
            saved,
            account => account.Id == householdAccount.Id);
        Assert.Equal(AccountScope.Household, savedHouseholdAccount.Scope);
        Assert.Null(savedHouseholdAccount.OwnerUserId);

        var savedPersonalAccount = Assert.Single(
            saved,
            account => account.Id == personalAccount.Id);
        Assert.Equal(AccountScope.Personal, savedPersonalAccount.Scope);
        Assert.Equal(ownerUserId, savedPersonalAccount.OwnerUserId);
        Assert.Equal("9876", savedPersonalAccount.LastFourDigits);
    }

    [Fact]
    public async Task PersonalAccount_WithUnknownOwner_IsRejectedByDatabase()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();

        await using var context = CreateContext(connection);
        var (household, _) = await AddHousehold(context);
        context.Accounts.Add(Account.CreatePersonal(
            household.Id,
            Guid.NewGuid(),
            "Unknown Owner Account",
            AccountType.Other,
            "CAD",
            null,
            null,
            DateTimeOffset.UtcNow));

        await Assert.ThrowsAsync<DbUpdateException>(() =>
            context.SaveChangesAsync());
    }

    private static BudgetAppDbContext CreateContext(SqliteConnection connection)
    {
        var options = new DbContextOptionsBuilder<BudgetAppDbContext>()
            .UseSqlite(connection)
            .Options;

        var context = new BudgetAppDbContext(options);
        context.Database.EnsureCreated();
        return context;
    }

    private static async Task<(Household Household, Guid OwnerUserId)> AddHousehold(
        BudgetAppDbContext context)
    {
        var ownerUserId = Guid.NewGuid();
        context.Users.Add(new ApplicationUser
        {
            Id = ownerUserId,
            DisplayName = "Account Owner",
            Email = $"account-{ownerUserId:N}@example.test",
            NormalizedEmail = $"ACCOUNT-{ownerUserId:N}@EXAMPLE.TEST",
            UserName = $"account-{ownerUserId:N}@example.test",
            NormalizedUserName = $"ACCOUNT-{ownerUserId:N}@EXAMPLE.TEST"
        });

        var household = Household.Create(
            "Account Household",
            "CAD",
            "America/Vancouver",
            ownerUserId,
            DateTimeOffset.UtcNow);
        context.Households.Add(household);
        await context.SaveChangesAsync();
        return (household, ownerUserId);
    }
}
