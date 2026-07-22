using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BudgetApp.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddBudgeting : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "BudgetMonths",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    HouseholdId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Year = table.Column<int>(type: "int", nullable: false),
                    Month = table.Column<int>(type: "int", nullable: false),
                    Scope = table.Column<string>(type: "varchar(20)", unicode: false, maxLength: 20, nullable: false),
                    OwnerUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Currency = table.Column<string>(type: "char(3)", unicode: false, fixedLength: true, maxLength: 3, nullable: false),
                    Status = table.Column<string>(type: "varchar(20)", unicode: false, maxLength: 20, nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BudgetMonths", x => x.Id);
                    table.CheckConstraint("CK_BudgetMonths_Month", "[Month] >= 1 AND [Month] <= 12");
                    table.CheckConstraint("CK_BudgetMonths_Scope_Owner", "([Scope] = 'Household' AND [OwnerUserId] IS NULL) OR ([Scope] = 'Personal' AND [OwnerUserId] IS NOT NULL)");
                    table.CheckConstraint("CK_BudgetMonths_Year", "[Year] >= 1 AND [Year] <= 9999");
                    table.ForeignKey(
                        name: "FK_BudgetMonths_AspNetUsers_OwnerUserId",
                        column: x => x.OwnerUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_BudgetMonths_Households_HouseholdId",
                        column: x => x.HouseholdId,
                        principalTable: "Households",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "BudgetLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BudgetMonthId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CategoryId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BudgetedAmount = table.Column<decimal>(type: "decimal(19,4)", precision: 19, scale: 4, nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BudgetLines", x => x.Id);
                    table.CheckConstraint("CK_BudgetLines_BudgetedAmount", "[BudgetedAmount] >= 0");
                    table.ForeignKey(
                        name: "FK_BudgetLines_BudgetMonths_BudgetMonthId",
                        column: x => x.BudgetMonthId,
                        principalTable: "BudgetMonths",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_BudgetLines_Categories_CategoryId",
                        column: x => x.CategoryId,
                        principalTable: "Categories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BudgetLines_BudgetMonthId_CategoryId",
                table: "BudgetLines",
                columns: new[] { "BudgetMonthId", "CategoryId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BudgetLines_CategoryId",
                table: "BudgetLines",
                column: "CategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_BudgetMonths_HouseholdId_Year_Month",
                table: "BudgetMonths",
                columns: new[] { "HouseholdId", "Year", "Month" },
                unique: true,
                filter: "[Scope] = 'Household'");

            migrationBuilder.CreateIndex(
                name: "IX_BudgetMonths_HouseholdId_Year_Month_OwnerUserId",
                table: "BudgetMonths",
                columns: new[] { "HouseholdId", "Year", "Month", "OwnerUserId" },
                unique: true,
                filter: "[Scope] = 'Personal'");

            migrationBuilder.CreateIndex(
                name: "IX_BudgetMonths_OwnerUserId",
                table: "BudgetMonths",
                column: "OwnerUserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BudgetLines");

            migrationBuilder.DropTable(
                name: "BudgetMonths");
        }
    }
}
