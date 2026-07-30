using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BudgetApp.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddYearlyPlans : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "FiscalYearStartMonth",
                table: "Households",
                type: "int",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.CreateTable(
                name: "YearlyPlans",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    HouseholdId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FiscalYearStartYear = table.Column<int>(type: "int", nullable: false),
                    FiscalYearStartMonth = table.Column<int>(type: "int", nullable: false),
                    Scope = table.Column<string>(type: "varchar(20)", unicode: false, maxLength: 20, nullable: false),
                    OwnerUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Currency = table.Column<string>(type: "char(3)", unicode: false, fixedLength: true, maxLength: 3, nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_YearlyPlans", x => x.Id);
                    table.CheckConstraint("CK_YearlyPlans_Scope_Owner", "([Scope] = 'Household' AND [OwnerUserId] IS NULL) OR ([Scope] = 'Personal' AND [OwnerUserId] IS NOT NULL)");
                    table.CheckConstraint("CK_YearlyPlans_StartMonth", "[FiscalYearStartMonth] >= 1 AND [FiscalYearStartMonth] <= 12");
                    table.ForeignKey(
                        name: "FK_YearlyPlans_AspNetUsers_OwnerUserId",
                        column: x => x.OwnerUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_YearlyPlans_Households_HouseholdId",
                        column: x => x.HouseholdId,
                        principalTable: "Households",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "YearlyTargetLines",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    YearlyPlanId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CategoryId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AnnualTargetAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_YearlyTargetLines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_YearlyTargetLines_Categories_CategoryId",
                        column: x => x.CategoryId,
                        principalTable: "Categories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_YearlyTargetLines_YearlyPlans_YearlyPlanId",
                        column: x => x.YearlyPlanId,
                        principalTable: "YearlyPlans",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.AddCheckConstraint(
                name: "CK_Households_FiscalYearStartMonth",
                table: "Households",
                sql: "[FiscalYearStartMonth] >= 1 AND [FiscalYearStartMonth] <= 12");

            migrationBuilder.CreateIndex(
                name: "IX_YearlyPlans_HouseholdId_FiscalYearStartYear",
                table: "YearlyPlans",
                columns: new[] { "HouseholdId", "FiscalYearStartYear" },
                unique: true,
                filter: "[Scope] = 'Household'");

            migrationBuilder.CreateIndex(
                name: "IX_YearlyPlans_HouseholdId_FiscalYearStartYear_OwnerUserId",
                table: "YearlyPlans",
                columns: new[] { "HouseholdId", "FiscalYearStartYear", "OwnerUserId" },
                unique: true,
                filter: "[Scope] = 'Personal'");

            migrationBuilder.CreateIndex(
                name: "IX_YearlyPlans_OwnerUserId",
                table: "YearlyPlans",
                column: "OwnerUserId");

            migrationBuilder.CreateIndex(
                name: "IX_YearlyTargetLines_CategoryId",
                table: "YearlyTargetLines",
                column: "CategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_YearlyTargetLines_YearlyPlanId_CategoryId",
                table: "YearlyTargetLines",
                columns: new[] { "YearlyPlanId", "CategoryId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "YearlyTargetLines");

            migrationBuilder.DropTable(
                name: "YearlyPlans");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Households_FiscalYearStartMonth",
                table: "Households");

            migrationBuilder.DropColumn(
                name: "FiscalYearStartMonth",
                table: "Households");
        }
    }
}
