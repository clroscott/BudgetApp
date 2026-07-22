using BudgetApp.Domain.Budgeting;
using BudgetApp.Domain.Categories;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BudgetApp.Infrastructure.Data.Configurations;

internal sealed class BudgetLineConfiguration : IEntityTypeConfiguration<BudgetLine>
{
    public void Configure(EntityTypeBuilder<BudgetLine> builder)
    {
        builder.ToTable("BudgetLines", table =>
            table.HasCheckConstraint(
                "CK_BudgetLines_BudgetedAmount",
                "[BudgetedAmount] >= 0"));

        builder.HasKey(budgetLine => budgetLine.Id);

        builder.HasIndex(budgetLine => new
            {
                budgetLine.BudgetMonthId,
                budgetLine.CategoryId
            })
            .IsUnique();

        builder.HasIndex(budgetLine => budgetLine.CategoryId);

        builder.Property(budgetLine => budgetLine.BudgetedAmount)
            .HasPrecision(19, 4)
            .IsRequired();

        builder.Property(budgetLine => budgetLine.CreatedAtUtc)
            .IsRequired();

        builder.Property(budgetLine => budgetLine.UpdatedAtUtc)
            .IsRequired()
            .IsConcurrencyToken();

        builder.HasOne<BudgetMonth>()
            .WithMany(budgetMonth => budgetMonth.Lines)
            .HasForeignKey(budgetLine => budgetLine.BudgetMonthId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne<Category>()
            .WithMany()
            .HasForeignKey(budgetLine => budgetLine.CategoryId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
