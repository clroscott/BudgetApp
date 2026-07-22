using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BudgetApp.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddTransactions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Transactions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    HouseholdId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AccountId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CategoryId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ImportFileId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ImportRowNumber = table.Column<int>(type: "int", nullable: true),
                    TransactionDate = table.Column<DateOnly>(type: "date", nullable: false),
                    PostedDate = table.Column<DateOnly>(type: "date", nullable: true),
                    Amount = table.Column<decimal>(type: "decimal(19,4)", precision: 19, scale: 4, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(250)", maxLength: 250, nullable: false),
                    OriginalDescription = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    MerchantName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    Source = table.Column<string>(type: "varchar(20)", unicode: false, maxLength: 20, nullable: false),
                    ReviewStatus = table.Column<string>(type: "varchar(20)", unicode: false, maxLength: 20, nullable: false),
                    IsExcludedFromBudget = table.Column<bool>(type: "bit", nullable: false),
                    IsVoided = table.Column<bool>(type: "bit", nullable: false),
                    LastModifiedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Transactions", x => x.Id);
                    table.CheckConstraint("CK_Transactions_Amount_NonZero", "[Amount] <> 0");
                    table.CheckConstraint("CK_Transactions_Source_ImportReference", "([Source] = 'Import' AND [ImportFileId] IS NOT NULL AND [ImportRowNumber] IS NOT NULL AND [ImportRowNumber] > 0) OR ([Source] <> 'Import' AND [ImportFileId] IS NULL AND [ImportRowNumber] IS NULL)");
                    table.ForeignKey(
                        name: "FK_Transactions_Accounts_AccountId",
                        column: x => x.AccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Transactions_AspNetUsers_LastModifiedByUserId",
                        column: x => x.LastModifiedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Transactions_Categories_CategoryId",
                        column: x => x.CategoryId,
                        principalTable: "Categories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Transactions_Households_HouseholdId",
                        column: x => x.HouseholdId,
                        principalTable: "Households",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Transactions_AccountId_TransactionDate",
                table: "Transactions",
                columns: new[] { "AccountId", "TransactionDate" });

            migrationBuilder.CreateIndex(
                name: "IX_Transactions_CategoryId_TransactionDate",
                table: "Transactions",
                columns: new[] { "CategoryId", "TransactionDate" });

            migrationBuilder.CreateIndex(
                name: "IX_Transactions_HouseholdId_TransactionDate",
                table: "Transactions",
                columns: new[] { "HouseholdId", "TransactionDate" });

            migrationBuilder.CreateIndex(
                name: "IX_Transactions_ImportFileId_ImportRowNumber",
                table: "Transactions",
                columns: new[] { "ImportFileId", "ImportRowNumber" },
                unique: true,
                filter: "[ImportFileId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Transactions_LastModifiedByUserId",
                table: "Transactions",
                column: "LastModifiedByUserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Transactions");
        }
    }
}
