using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BudgetApp.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddImportStaging : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ImportFiles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    HouseholdId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AccountId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UploadedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OriginalFileName = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    FileSizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    Sha256Hash = table.Column<string>(type: "char(64)", unicode: false, fixedLength: true, maxLength: 64, nullable: false),
                    Status = table.Column<string>(type: "varchar(30)", unicode: false, maxLength: 30, nullable: false),
                    TotalRowCount = table.Column<int>(type: "int", nullable: false),
                    ValidRowCount = table.Column<int>(type: "int", nullable: false),
                    InvalidRowCount = table.Column<int>(type: "int", nullable: false),
                    ApprovedRowCount = table.Column<int>(type: "int", nullable: false),
                    RejectedRowCount = table.Column<int>(type: "int", nullable: false),
                    SkippedRowCount = table.Column<int>(type: "int", nullable: false),
                    DuplicateRowCount = table.Column<int>(type: "int", nullable: false),
                    FailureSummary = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    UploadedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ImportFiles", x => x.Id);
                    table.CheckConstraint("CK_ImportFiles_FileSize_Positive", "[FileSizeBytes] > 0");
                    table.CheckConstraint("CK_ImportFiles_RowCounts", "[TotalRowCount] >= 0 AND [ValidRowCount] >= 0 AND [InvalidRowCount] >= 0 AND [ApprovedRowCount] >= 0 AND [RejectedRowCount] >= 0 AND [SkippedRowCount] >= 0 AND [DuplicateRowCount] >= 0 AND [ValidRowCount] + [InvalidRowCount] = [TotalRowCount] AND [ApprovedRowCount] <= [ValidRowCount] AND [ApprovedRowCount] + [RejectedRowCount] + [SkippedRowCount] <= [TotalRowCount] AND [DuplicateRowCount] <= [TotalRowCount]");
                    table.CheckConstraint("CK_ImportFiles_Status_FailureSummary", "([Status] = 'Failed' AND [FailureSummary] IS NOT NULL) OR ([Status] <> 'Failed' AND [FailureSummary] IS NULL)");
                    table.ForeignKey(
                        name: "FK_ImportFiles_Accounts_AccountId",
                        column: x => x.AccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ImportFiles_AspNetUsers_UploadedByUserId",
                        column: x => x.UploadedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ImportFiles_Households_HouseholdId",
                        column: x => x.HouseholdId,
                        principalTable: "Households",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ImportTransactionDrafts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ImportFileId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SourceRowNumber = table.Column<int>(type: "int", nullable: false),
                    RawData = table.Column<string>(type: "nvarchar(max)", maxLength: 16000, nullable: false),
                    OriginalTransactionDate = table.Column<DateOnly>(type: "date", nullable: true),
                    OriginalAmount = table.Column<decimal>(type: "decimal(28,8)", precision: 28, scale: 8, nullable: true),
                    OriginalDescription = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    OriginalValidationMessage = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    TransactionDate = table.Column<DateOnly>(type: "date", nullable: true),
                    Amount = table.Column<decimal>(type: "decimal(28,8)", precision: 28, scale: 8, nullable: true),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    SuggestedCategoryId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SelectedCategoryId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ValidationStatus = table.Column<string>(type: "varchar(20)", unicode: false, maxLength: 20, nullable: false),
                    ValidationMessage = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    DuplicateStatus = table.Column<string>(type: "varchar(30)", unicode: false, maxLength: 30, nullable: false),
                    PossibleMatchingTransactionId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ReviewDecision = table.Column<string>(type: "varchar(20)", unicode: false, maxLength: 20, nullable: false),
                    IsDuplicateAcknowledged = table.Column<bool>(type: "bit", nullable: false),
                    ReviewedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ReviewedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ApprovedTransactionId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ImportTransactionDrafts", x => x.Id);
                    table.CheckConstraint("CK_ImportTransactionDrafts_Approval", "[ReviewDecision] <> 'Approved' OR ([ValidationStatus] = 'Valid' AND ([DuplicateStatus] <> 'PossibleDuplicate' OR [IsDuplicateAcknowledged] = 1))");
                    table.CheckConstraint("CK_ImportTransactionDrafts_ApprovedTransaction", "[ApprovedTransactionId] IS NULL OR [ReviewDecision] = 'Approved'");
                    table.CheckConstraint("CK_ImportTransactionDrafts_DuplicateMatch", "([DuplicateStatus] = 'PossibleDuplicate' AND [PossibleMatchingTransactionId] IS NOT NULL) OR ([DuplicateStatus] <> 'PossibleDuplicate' AND [PossibleMatchingTransactionId] IS NULL)");
                    table.CheckConstraint("CK_ImportTransactionDrafts_ReviewMetadata", "([ReviewDecision] = 'Pending' AND [ReviewedByUserId] IS NULL AND [ReviewedAtUtc] IS NULL) OR ([ReviewDecision] <> 'Pending' AND [ReviewedByUserId] IS NOT NULL AND [ReviewedAtUtc] IS NOT NULL)");
                    table.CheckConstraint("CK_ImportTransactionDrafts_SourceRowNumber_Positive", "[SourceRowNumber] > 0");
                    table.CheckConstraint("CK_ImportTransactionDrafts_Validation", "([ValidationStatus] = 'Valid' AND [TransactionDate] IS NOT NULL AND [Amount] IS NOT NULL AND [Amount] <> 0 AND [Description] IS NOT NULL AND [ValidationMessage] IS NULL) OR ([ValidationStatus] = 'Invalid' AND [ValidationMessage] IS NOT NULL)");
                    table.ForeignKey(
                        name: "FK_ImportTransactionDrafts_AspNetUsers_ReviewedByUserId",
                        column: x => x.ReviewedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ImportTransactionDrafts_Categories_SelectedCategoryId",
                        column: x => x.SelectedCategoryId,
                        principalTable: "Categories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ImportTransactionDrafts_Categories_SuggestedCategoryId",
                        column: x => x.SuggestedCategoryId,
                        principalTable: "Categories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ImportTransactionDrafts_ImportFiles_ImportFileId",
                        column: x => x.ImportFileId,
                        principalTable: "ImportFiles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ImportTransactionDrafts_Transactions_ApprovedTransactionId",
                        column: x => x.ApprovedTransactionId,
                        principalTable: "Transactions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ImportTransactionDrafts_Transactions_PossibleMatchingTransactionId",
                        column: x => x.PossibleMatchingTransactionId,
                        principalTable: "Transactions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ImportFiles_AccountId_Sha256Hash",
                table: "ImportFiles",
                columns: new[] { "AccountId", "Sha256Hash" });

            migrationBuilder.CreateIndex(
                name: "IX_ImportFiles_AccountId_UploadedAtUtc",
                table: "ImportFiles",
                columns: new[] { "AccountId", "UploadedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_ImportFiles_HouseholdId_UploadedAtUtc",
                table: "ImportFiles",
                columns: new[] { "HouseholdId", "UploadedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_ImportFiles_UploadedByUserId",
                table: "ImportFiles",
                column: "UploadedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ImportTransactionDrafts_ApprovedTransactionId",
                table: "ImportTransactionDrafts",
                column: "ApprovedTransactionId",
                unique: true,
                filter: "[ApprovedTransactionId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_ImportTransactionDrafts_ImportFileId_ReviewDecision",
                table: "ImportTransactionDrafts",
                columns: new[] { "ImportFileId", "ReviewDecision" });

            migrationBuilder.CreateIndex(
                name: "IX_ImportTransactionDrafts_ImportFileId_SourceRowNumber",
                table: "ImportTransactionDrafts",
                columns: new[] { "ImportFileId", "SourceRowNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ImportTransactionDrafts_ImportFileId_ValidationStatus",
                table: "ImportTransactionDrafts",
                columns: new[] { "ImportFileId", "ValidationStatus" });

            migrationBuilder.CreateIndex(
                name: "IX_ImportTransactionDrafts_PossibleMatchingTransactionId",
                table: "ImportTransactionDrafts",
                column: "PossibleMatchingTransactionId");

            migrationBuilder.CreateIndex(
                name: "IX_ImportTransactionDrafts_ReviewedByUserId",
                table: "ImportTransactionDrafts",
                column: "ReviewedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ImportTransactionDrafts_SelectedCategoryId",
                table: "ImportTransactionDrafts",
                column: "SelectedCategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_ImportTransactionDrafts_SuggestedCategoryId",
                table: "ImportTransactionDrafts",
                column: "SuggestedCategoryId");

            migrationBuilder.AddForeignKey(
                name: "FK_Transactions_ImportFiles_ImportFileId",
                table: "Transactions",
                column: "ImportFileId",
                principalTable: "ImportFiles",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Transactions_ImportFiles_ImportFileId",
                table: "Transactions");

            migrationBuilder.DropTable(
                name: "ImportTransactionDrafts");

            migrationBuilder.DropTable(
                name: "ImportFiles");
        }
    }
}
