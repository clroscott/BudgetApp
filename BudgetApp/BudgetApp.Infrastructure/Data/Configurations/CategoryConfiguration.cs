using BudgetApp.Domain.Categories;
using BudgetApp.Domain.Households;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BudgetApp.Infrastructure.Data.Configurations;

internal sealed class CategoryConfiguration : IEntityTypeConfiguration<Category>
{
    public void Configure(EntityTypeBuilder<Category> builder)
    {
        builder.ToTable("Categories", table =>
            table.HasCheckConstraint(
                "CK_Categories_DisplayOrder_NonNegative",
                "[DisplayOrder] >= 0"));

        builder.HasKey(category => category.Id);

        builder.HasIndex(category => new
            {
                category.HouseholdId,
                category.Type,
                category.NormalizedName
            })
            .IsUnique()
            .HasFilter("[ParentCategoryId] IS NULL");

        builder.HasIndex(category => new
            {
                category.ParentCategoryId,
                category.NormalizedName
            })
            .IsUnique()
            .HasFilter("[ParentCategoryId] IS NOT NULL");

        builder.Property(category => category.Name)
            .HasMaxLength(Category.NameMaxLength)
            .IsRequired();

        builder.Property(category => category.NormalizedName)
            .HasMaxLength(Category.NameMaxLength)
            .IsRequired();

        builder.Property(category => category.Type)
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsUnicode(false)
            .IsRequired();

        builder.Property(category => category.DisplayOrder)
            .IsRequired();

        builder.Property(category => category.IsActive)
            .IsRequired();

        builder.Property(category => category.CreatedAtUtc)
            .IsRequired();

        builder.Property(category => category.UpdatedAtUtc)
            .IsRequired();

        builder.HasOne<Household>()
            .WithMany()
            .HasForeignKey(category => category.HouseholdId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(category => category.Parent)
            .WithMany(category => category.Children)
            .HasForeignKey(category => category.ParentCategoryId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Navigation(category => category.Children)
            .UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}
