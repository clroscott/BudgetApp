using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.Budgeting;
using BudgetApp.Domain.Categories;
using BudgetApp.Domain.Households;
using BudgetApp.Domain.Transactions;
using BudgetApp.Infrastructure.Data;
using BudgetApp.Infrastructure.Identity;

namespace BudgetApp.Profiling;

// Shared disposable adversarial fixture for SQLite parity tests and real SQL
// Server profiling. No authentication, SMTP or existing application data is used.
internal sealed record BudgetActualsFixture(Guid HouseholdId, Guid OwnerId, Guid ViewerId,
    Guid SharedAccountId, Guid RootId, Guid ChildId, Guid InactiveId)
{
    public static async Task<BudgetActualsFixture> Seed(BudgetAppDbContext db)
    {
        var now = new DateTimeOffset(2026, 10, 1, 0, 0, 0, TimeSpan.Zero);
        var owner = new ApplicationUser { Id = Guid.NewGuid(), DisplayName = "Synthetic owner" };
        var viewer = new ApplicationUser { Id = Guid.NewGuid(), DisplayName = "Synthetic viewer" };
        db.Users.AddRange(owner, viewer);
        var household = Household.Create("Synthetic financial parity", "CAD", "UTC", owner.Id, now);
        household.AddInvitedMember(viewer.Id, HouseholdRole.Viewer, owner.Id, now);
        var outsider = Household.Create("Synthetic outside household", "CAD", "UTC", owner.Id, now);
        db.Households.AddRange(household, outsider);
        var root = Category.CreateRoot(household.Id, "Expense root", CategoryType.Expense, 0, now);
        var child = root.AddSubcategory("Expense child", 0, now);
        var inactive = Category.CreateRoot(household.Id, "Inactive expense", CategoryType.Expense, 1, now);
        inactive.Deactivate(now);
        var income = Category.CreateRoot(household.Id, "Income", CategoryType.Income, 2, now);
        db.Categories.AddRange(root, inactive, income);
        var shared = Account.CreateHousehold(household.Id, "Shared CAD", AccountType.Chequing, "CAD", null, null, now);
        var usd = Account.CreateHousehold(household.Id, "Shared USD", AccountType.Chequing, "USD", null, null, now);
        var personal = Account.CreatePersonal(household.Id, owner.Id, "Owner CAD", AccountType.Chequing, "CAD", null, null, now);
        var privateOther = Account.CreatePersonal(household.Id, viewer.Id, "Viewer CAD", AccountType.Chequing, "CAD", null, null, now);
        var outsideAccount = Account.CreateHousehold(outsider.Id, "Outside CAD", AccountType.Chequing, "CAD", null, null, now);
        db.Accounts.AddRange(shared, usd, personal, privateOther, outsideAccount);
        Transaction Add(Account account, Guid? category, decimal amount, int month = 1, int year = 2026,
            bool excluded = false, bool? householdIncluded = null, Guid? personalIncluded = null, bool voided = false)
        {
            var row = Transaction.CreateManual(account.HouseholdId, account.Id, category,
                new DateOnly(year, month, DateTime.DaysInMonth(year, month)), null, amount,
                "Synthetic fixture only", null, null, excluded, owner.Id, now);
            if (householdIncluded.HasValue)
            {
                row.InitializeBudgetInclusion(account.Scope == AccountScope.Household, account.OwnerUserId);
                row.SetBudgetInclusionForUser(account.OwnerUserId ?? owner.Id, householdIncluded,
                    personalIncluded == (account.OwnerUserId ?? owner.Id), now);
                if (personalIncluded.HasValue && personalIncluded != (account.OwnerUserId ?? owner.Id))
                    row.SetBudgetInclusionForUser(personalIncluded.Value, null, true, now);
            }
            if (voided) row.Void(owner.Id, now);
            db.Transactions.Add(row);
            return row;
        }
        Add(shared, child.Id, 100.1234m);
        Add(shared, child.Id, -10.1234m);
        Add(shared, root.Id, 5.0001m);
        Add(shared, inactive.Id, 7.7777m);
        Add(shared, null, 25.1234m);
        Add(shared, null, -2.1234m);
        Add(shared, income.Id, -1000.4321m);
        Add(shared, income.Id, 12.9999m); // Positive income-category values are not spending/income.
        Add(personal, child.Id, 50m); // Legacy owner default.
        Add(privateOther, child.Id, 60m); // Legacy private-other default.
        Add(privateOther, child.Id, 200m, householdIncluded: true, personalIncluded: owner.Id);
        Add(privateOther, child.Id, 333.9999m, householdIncluded: false, personalIncluded: owner.Id); // Stale private selection is invisible to owner.
        Add(shared, child.Id, 30m, householdIncluded: false, personalIncluded: owner.Id);
        Add(personal, child.Id, 40.0002m, householdIncluded: true, personalIncluded: owner.Id);
        Add(shared, child.Id, 8m, householdIncluded: false, personalIncluded: viewer.Id);
        Add(shared, child.Id, 90000m, excluded: true);
        Add(shared, child.Id, 80000m, voided: true);
        Add(usd, child.Id, 99m);
        Add(usd, income.Id, -100m);
        Add(usd, null, -4m);
        Add(shared, child.Id, 0.0001m, month: 2);
        Add(shared, null, 10m, month: 2);
        Add(shared, null, -10m, month: 2); // Net zero must still mean 10 spending and 10 income.
        Add(shared, child.Id, 13.1313m, month: 12);
        Add(shared, child.Id, 66m, month: 12, year: 2025);
        Add(shared, child.Id, 77m, year: 2027);
        Add(outsideAccount, null, 70000m);
        var january = BudgetMonth.CreateHousehold(household.Id, 2026, 1, "CAD", now);
        january.AddLine(root.Id, 200m, now);
        january.AddLine(child.Id, 0m, now);
        db.BudgetMonths.Add(january);
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        return new(household.Id, owner.Id, viewer.Id, shared.Id, root.Id, child.Id, inactive.Id);
    }
}
