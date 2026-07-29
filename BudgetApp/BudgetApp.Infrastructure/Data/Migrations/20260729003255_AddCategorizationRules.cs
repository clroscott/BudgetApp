using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BudgetApp.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCategorizationRules : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CategorizationRules",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    HouseholdId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    NormalizedName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    MatchField = table.Column<string>(type: "varchar(30)", unicode: false, maxLength: 30, nullable: false),
                    MatchOperator = table.Column<string>(type: "varchar(30)", unicode: false, maxLength: 30, nullable: false),
                    MatchValue = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    NormalizedMatchValue = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    AccountId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    TargetCategoryId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Priority = table.Column<int>(type: "int", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CategorizationRules", x => x.Id);
                    table.CheckConstraint("CK_CategorizationRules_Priority_NonNegative", "[Priority] >= 0");
                    table.ForeignKey(
                        name: "FK_CategorizationRules_Accounts_AccountId",
                        column: x => x.AccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CategorizationRules_Categories_TargetCategoryId",
                        column: x => x.TargetCategoryId,
                        principalTable: "Categories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CategorizationRules_Households_HouseholdId",
                        column: x => x.HouseholdId,
                        principalTable: "Households",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CategorizationRules_AccountId",
                table: "CategorizationRules",
                column: "AccountId");

            migrationBuilder.CreateIndex(
                name: "IX_CategorizationRules_HouseholdId_NormalizedName",
                table: "CategorizationRules",
                columns: new[] { "HouseholdId", "NormalizedName" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CategorizationRules_HouseholdId_Priority",
                table: "CategorizationRules",
                columns: new[] { "HouseholdId", "Priority" });

            migrationBuilder.CreateIndex(
                name: "IX_CategorizationRules_TargetCategoryId",
                table: "CategorizationRules",
                column: "TargetCategoryId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CategorizationRules");
        }
    }
}
