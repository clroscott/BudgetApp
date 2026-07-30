using BudgetApp.Domain.Budgeting;
using BudgetApp.Domain.Categories;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BudgetApp.Infrastructure.Data.Configurations;

internal sealed class YearlyTargetLineConfiguration :
    IEntityTypeConfiguration<YearlyTargetLine>
{
    public void Configure(EntityTypeBuilder<YearlyTargetLine> builder)
    {
        builder.ToTable("YearlyTargetLines");
        builder.HasKey(line => line.Id);
        builder.HasIndex(line => new { line.YearlyPlanId, line.CategoryId }).IsUnique();
        builder.Property(line => line.AnnualTargetAmount)
            .HasPrecision(18, 2)
            .IsRequired();
        builder.Property(line => line.CreatedAtUtc).IsRequired();
        builder.Property(line => line.UpdatedAtUtc).IsRequired();
        builder.HasOne<YearlyPlan>()
            .WithMany(plan => plan.Lines)
            .HasForeignKey(line => line.YearlyPlanId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<Category>()
            .WithMany()
            .HasForeignKey(line => line.CategoryId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
