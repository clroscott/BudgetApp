using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BudgetApp.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddTransactionBudgetInclusion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IncludeInHouseholdBudget",
                table: "Transactions",
                type: "bit",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IncludeInHouseholdBudget",
                table: "ImportTransactionDrafts",
                type: "bit",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "PersonalBudgetUserId",
                table: "ImportTransactionDrafts",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "TransactionPersonalBudgetInclusions",
                columns: table => new
                {
                    TransactionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TransactionPersonalBudgetInclusions", x => new { x.TransactionId, x.UserId });
                    table.ForeignKey(
                        name: "FK_TransactionPersonalBudgetInclusions_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TransactionPersonalBudgetInclusions_Transactions_TransactionId",
                        column: x => x.TransactionId,
                        principalTable: "Transactions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TransactionPersonalBudgetInclusions_UserId_TransactionId",
                table: "TransactionPersonalBudgetInclusions",
                columns: new[] { "UserId", "TransactionId" });

            // Preserve existing totals and privacy; never opt historical rows into both.
            const string backfillSql = """
                UPDATE [Transactions] SET [IncludeInHouseholdBudget] = CASE
                  WHEN [IsExcludedFromBudget] = 0 AND
                    (SELECT [Scope] FROM [Accounts] WHERE [Id] = [Transactions].[AccountId]) = 'Household'
                  THEN 1 ELSE 0 END;
                INSERT INTO [TransactionPersonalBudgetInclusions] ([TransactionId], [UserId])
                SELECT t.[Id], a.[OwnerUserId] FROM [Transactions] t
                JOIN [Accounts] a ON a.[Id] = t.[AccountId]
                WHERE t.[IsExcludedFromBudget] = 0 AND a.[Scope] = 'Personal' AND a.[OwnerUserId] IS NOT NULL;
                UPDATE [ImportTransactionDrafts] SET [IncludeInHouseholdBudget] = CASE
                  WHEN (SELECT a.[Scope] FROM [ImportFiles] i JOIN [Accounts] a ON a.[Id] = i.[AccountId]
                    WHERE i.[Id] = [ImportTransactionDrafts].[ImportFileId]) = 'Household'
                  THEN 1 ELSE 0 END,
                  [PersonalBudgetUserId] = (SELECT a.[OwnerUserId] FROM [ImportFiles] i
                    JOIN [Accounts] a ON a.[Id] = i.[AccountId]
                    WHERE i.[Id] = [ImportTransactionDrafts].[ImportFileId] AND a.[Scope] = 'Personal');
                """;
            // Idempotent SQL Server scripts can put the ALTER and UPDATE in one
            // batch. Defer compilation of references to the new columns until
            // after the ALTER statements have actually executed.
            migrationBuilder.Sql(migrationBuilder.ActiveProvider == "Microsoft.EntityFrameworkCore.SqlServer"
                ? "EXEC(N'" + backfillSql.Replace("'", "''") + "');"
                : backfillSql);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TransactionPersonalBudgetInclusions");

            migrationBuilder.DropColumn(
                name: "IncludeInHouseholdBudget",
                table: "Transactions");

            migrationBuilder.DropColumn(
                name: "IncludeInHouseholdBudget",
                table: "ImportTransactionDrafts");

            migrationBuilder.DropColumn(
                name: "PersonalBudgetUserId",
                table: "ImportTransactionDrafts");
        }
    }
}
