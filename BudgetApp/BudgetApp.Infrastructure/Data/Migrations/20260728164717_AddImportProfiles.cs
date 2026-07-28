using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BudgetApp.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddImportProfiles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ImportProfiles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    HouseholdId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Headers = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    HeaderSignature = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    DateColumn = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    DescriptionColumn = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    AmountColumn = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    DebitColumn = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    CreditColumn = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    CategoryColumn = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    SubcategoryColumn = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    AmountConvention = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    DefaultAccountId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ImportProfiles", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ImportProfiles_Accounts_DefaultAccountId",
                        column: x => x.DefaultAccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.NoAction);
                    table.ForeignKey(
                        name: "FK_ImportProfiles_Households_HouseholdId",
                        column: x => x.HouseholdId,
                        principalTable: "Households",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ImportProfiles_DefaultAccountId",
                table: "ImportProfiles",
                column: "DefaultAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_ImportProfiles_HouseholdId_HeaderSignature",
                table: "ImportProfiles",
                columns: new[] { "HouseholdId", "HeaderSignature" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ImportProfiles");
        }
    }
}
