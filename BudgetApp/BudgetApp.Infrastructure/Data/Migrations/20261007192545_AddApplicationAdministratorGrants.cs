using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BudgetApp.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddApplicationAdministratorGrants : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ApplicationAdministrationState",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false),
                    BootstrapCompleted = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ApplicationAdministrationState", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ApplicationAdministratorGrants",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Role = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    Version = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ApplicationAdministratorGrants", x => x.UserId);
                    table.ForeignKey(
                        name: "FK_ApplicationAdministratorGrants_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "ApplicationAdministrationState",
                columns: new[] { "Id", "BootstrapCompleted" },
                values: new object[] { 1, false });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ApplicationAdministrationState");

            migrationBuilder.DropTable(
                name: "ApplicationAdministratorGrants");
        }
    }
}
