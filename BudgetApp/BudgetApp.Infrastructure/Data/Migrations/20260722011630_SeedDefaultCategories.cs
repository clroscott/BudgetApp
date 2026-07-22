using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BudgetApp.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class SeedDefaultCategories : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                DECLARE @CreatedAtUtc datetimeoffset =
                    TODATETIMEOFFSET(SYSUTCDATETIME(), '+00:00');

                DECLARE @DefaultRoots TABLE
                (
                    HouseholdId uniqueidentifier NOT NULL,
                    RootKey varchar(50) NOT NULL,
                    CategoryId uniqueidentifier NOT NULL,
                    Name nvarchar(100) NOT NULL,
                    NormalizedName nvarchar(100) NOT NULL,
                    Type varchar(20) NOT NULL,
                    DisplayOrder int NOT NULL
                );

                INSERT INTO @DefaultRoots
                (
                    HouseholdId,
                    RootKey,
                    CategoryId,
                    Name,
                    NormalizedName,
                    Type,
                    DisplayOrder
                )
                SELECT
                    household.Id,
                    definition.RootKey,
                    NEWID(),
                    definition.Name,
                    UPPER(definition.Name),
                    definition.Type,
                    definition.DisplayOrder
                FROM Households AS household
                CROSS JOIN
                (
                    VALUES
                        ('income', N'Income', 'Income', 0),
                        ('transfers', N'Transfers', 'Transfer', 1),
                        ('housing', N'Housing', 'Expense', 2),
                        ('food-dining', N'Food & Dining', 'Expense', 3),
                        ('transportation', N'Transportation', 'Expense', 4),
                        ('entertainment', N'Entertainment', 'Expense', 5),
                        ('subscriptions', N'Subscriptions', 'Expense', 6),
                        ('shopping', N'Shopping', 'Expense', 7),
                        ('health', N'Health', 'Expense', 8),
                        ('other', N'Other', 'Expense', 9)
                ) AS definition(RootKey, Name, Type, DisplayOrder)
                WHERE NOT EXISTS
                (
                    SELECT 1
                    FROM Categories AS existingCategory
                    WHERE existingCategory.HouseholdId = household.Id
                );

                INSERT INTO Categories
                (
                    Id,
                    HouseholdId,
                    Name,
                    NormalizedName,
                    Type,
                    ParentCategoryId,
                    DisplayOrder,
                    IsActive,
                    CreatedAtUtc,
                    UpdatedAtUtc
                )
                SELECT
                    CategoryId,
                    HouseholdId,
                    Name,
                    NormalizedName,
                    Type,
                    NULL,
                    DisplayOrder,
                    1,
                    @CreatedAtUtc,
                    @CreatedAtUtc
                FROM @DefaultRoots;

                INSERT INTO Categories
                (
                    Id,
                    HouseholdId,
                    Name,
                    NormalizedName,
                    Type,
                    ParentCategoryId,
                    DisplayOrder,
                    IsActive,
                    CreatedAtUtc,
                    UpdatedAtUtc
                )
                SELECT
                    NEWID(),
                    root.HouseholdId,
                    definition.Name,
                    UPPER(definition.Name),
                    root.Type,
                    root.CategoryId,
                    definition.DisplayOrder,
                    1,
                    @CreatedAtUtc,
                    @CreatedAtUtc
                FROM @DefaultRoots AS root
                INNER JOIN
                (
                    VALUES
                        ('income', N'Paycheque', 0),
                        ('income', N'Interest', 1),
                        ('income', N'Other Income', 2),
                        ('transfers', N'Account Transfer', 0),
                        ('transfers', N'Credit Card Payment', 1),
                        ('housing', N'Rent or Mortgage', 0),
                        ('housing', N'Utilities', 1),
                        ('housing', N'Insurance', 2),
                        ('housing', N'Maintenance', 3),
                        ('food-dining', N'Groceries', 0),
                        ('food-dining', N'Restaurants', 1),
                        ('transportation', N'Fuel', 0),
                        ('transportation', N'Public Transit', 1),
                        ('transportation', N'Parking', 2),
                        ('transportation', N'Repairs', 3),
                        ('entertainment', N'Events', 0),
                        ('entertainment', N'Games', 1),
                        ('entertainment', N'Movies', 2),
                        ('subscriptions', N'Streaming', 0),
                        ('subscriptions', N'Software', 1),
                        ('subscriptions', N'Memberships', 2),
                        ('shopping', N'Clothing', 0),
                        ('shopping', N'Household Items', 1),
                        ('shopping', N'Personal', 2),
                        ('health', N'Medical', 0),
                        ('health', N'Dental', 1),
                        ('health', N'Pharmacy', 2),
                        ('health', N'Fitness', 3),
                        ('other', N'Miscellaneous', 0)
                ) AS definition(RootKey, Name, DisplayOrder)
                    ON definition.RootKey = root.RootKey;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Category records become household-owned data as soon as they are
            // created. Preserve them when rolling back this data migration.
        }
    }
}
