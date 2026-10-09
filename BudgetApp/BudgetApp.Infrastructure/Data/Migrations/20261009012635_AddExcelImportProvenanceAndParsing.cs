using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BudgetApp.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddExcelImportProvenanceAndParsing : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DateFormat",
                table: "ImportProfiles",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "NumberCulture",
                table: "ImportProfiles",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SourceWorksheetId",
                table: "ImportFiles",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SourceWorksheetName",
                table: "ImportFiles",
                type: "nvarchar(31)",
                maxLength: 31,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DateFormat",
                table: "ImportProfiles");

            migrationBuilder.DropColumn(
                name: "NumberCulture",
                table: "ImportProfiles");

            migrationBuilder.DropColumn(
                name: "SourceWorksheetId",
                table: "ImportFiles");

            migrationBuilder.DropColumn(
                name: "SourceWorksheetName",
                table: "ImportFiles");
        }
    }
}
