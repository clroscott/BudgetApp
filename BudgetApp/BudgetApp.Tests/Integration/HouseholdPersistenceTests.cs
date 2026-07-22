using BudgetApp.Domain.Households;
using BudgetApp.Infrastructure.Data;
using BudgetApp.Infrastructure.Identity;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Tests.Integration;

public sealed class HouseholdPersistenceTests
{
    [Fact]
    public async Task HouseholdAndOwner_CanBeSavedAndLoaded()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();

        var options = new DbContextOptionsBuilder<BudgetAppDbContext>()
            .UseSqlite(connection)
            .Options;

        await using var context = new BudgetAppDbContext(options);
        await context.Database.EnsureCreatedAsync();

        var ownerUserId = Guid.NewGuid();
        context.Users.Add(new ApplicationUser
        {
            Id = ownerUserId,
            DisplayName = "Household Owner",
            Email = "owner@example.test",
            NormalizedEmail = "OWNER@EXAMPLE.TEST",
            UserName = "owner@example.test",
            NormalizedUserName = "OWNER@EXAMPLE.TEST"
        });

        var household = Household.Create(
            "Scott Household",
            "CAD",
            "America/Vancouver",
            ownerUserId,
            DateTimeOffset.UtcNow);
        context.Households.Add(household);

        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();

        var savedHousehold = await context.Households
            .Include(item => item.Members)
            .SingleAsync(item => item.Id == household.Id);

        var owner = Assert.Single(savedHousehold.Members);
        Assert.Equal(ownerUserId, owner.UserId);
        Assert.Equal(HouseholdRole.Owner, owner.Role);
        Assert.Equal(HouseholdMemberStatus.Active, owner.Status);
    }
}
