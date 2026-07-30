using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BudgetApp.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class ConsolidateExcludedImportDecision : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_ImportFiles_RowCounts",
                table: "ImportFiles");

            migrationBuilder.RenameColumn(
                name: "RejectedRowCount",
                table: "ImportFiles",
                newName: "ExcludedRowCount");

            migrationBuilder.Sql(
                """
                EXEC(N'
                    UPDATE [ImportFiles]
                    SET [ExcludedRowCount] = [ExcludedRowCount] + [SkippedRowCount];
                ');
                """);

            migrationBuilder.Sql(
                """
                UPDATE [ImportTransactionDrafts]
                SET [ReviewDecision] = 'Excluded'
                WHERE [ReviewDecision] IN ('Rejected', 'Skipped');
                """);

            migrationBuilder.DropColumn(
                name: "SkippedRowCount",
                table: "ImportFiles");

            migrationBuilder.AddCheckConstraint(
                name: "CK_ImportFiles_RowCounts",
                table: "ImportFiles",
                sql: "[TotalRowCount] >= 0 AND [ValidRowCount] >= 0 AND [InvalidRowCount] >= 0 AND [ApprovedRowCount] >= 0 AND [ExcludedRowCount] >= 0 AND [DuplicateRowCount] >= 0 AND [ValidRowCount] + [InvalidRowCount] = [TotalRowCount] AND [ApprovedRowCount] <= [ValidRowCount] AND [ApprovedRowCount] + [ExcludedRowCount] <= [TotalRowCount] AND [DuplicateRowCount] <= [TotalRowCount]");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_ImportFiles_RowCounts",
                table: "ImportFiles");

            migrationBuilder.AddColumn<int>(
                name: "SkippedRowCount",
                table: "ImportFiles",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.RenameColumn(
                name: "ExcludedRowCount",
                table: "ImportFiles",
                newName: "RejectedRowCount");

            migrationBuilder.Sql(
                """
                UPDATE [ImportTransactionDrafts]
                SET [ReviewDecision] = 'Rejected'
                WHERE [ReviewDecision] = 'Excluded';
                """);

            migrationBuilder.AddCheckConstraint(
                name: "CK_ImportFiles_RowCounts",
                table: "ImportFiles",
                sql: "[TotalRowCount] >= 0 AND [ValidRowCount] >= 0 AND [InvalidRowCount] >= 0 AND [ApprovedRowCount] >= 0 AND [RejectedRowCount] >= 0 AND [SkippedRowCount] >= 0 AND [DuplicateRowCount] >= 0 AND [ValidRowCount] + [InvalidRowCount] = [TotalRowCount] AND [ApprovedRowCount] <= [ValidRowCount] AND [ApprovedRowCount] + [RejectedRowCount] + [SkippedRowCount] <= [TotalRowCount] AND [DuplicateRowCount] <= [TotalRowCount]");
        }
    }
}
