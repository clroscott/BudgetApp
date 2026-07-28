using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BudgetApp.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddDashboardLayouts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DashboardLayouts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    HouseholdId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PreferredColumnCount = table.Column<int>(type: "int", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DashboardLayouts", x => x.Id);
                    table.CheckConstraint("CK_DashboardLayouts_PreferredColumnCount", "[PreferredColumnCount] > 0");
                    table.ForeignKey(
                        name: "FK_DashboardLayouts_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_DashboardLayouts_Households_HouseholdId",
                        column: x => x.HouseholdId,
                        principalTable: "Households",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "DashboardPanelPreferences",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DashboardLayoutId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PanelKey = table.Column<string>(type: "varchar(60)", unicode: false, maxLength: 60, nullable: false),
                    DisplayOrder = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DashboardPanelPreferences", x => x.Id);
                    table.CheckConstraint("CK_DashboardPanelPreferences_DisplayOrder", "[DisplayOrder] >= 0");
                    table.ForeignKey(
                        name: "FK_DashboardPanelPreferences_DashboardLayouts_DashboardLayoutId",
                        column: x => x.DashboardLayoutId,
                        principalTable: "DashboardLayouts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DashboardLayouts_HouseholdId_UserId",
                table: "DashboardLayouts",
                columns: new[] { "HouseholdId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_DashboardLayouts_UserId",
                table: "DashboardLayouts",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_DashboardPanelPreferences_DashboardLayoutId_PanelKey",
                table: "DashboardPanelPreferences",
                columns: new[] { "DashboardLayoutId", "PanelKey" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DashboardPanelPreferences");

            migrationBuilder.DropTable(
                name: "DashboardLayouts");
        }
    }
}
