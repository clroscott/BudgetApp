using BudgetApp.Domain.Transactions;
using BudgetApp.Infrastructure.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BudgetApp.Infrastructure.Data.Configurations;

internal sealed class TransactionPersonalBudgetInclusionConfiguration
    : IEntityTypeConfiguration<TransactionPersonalBudgetInclusion>
{
    public void Configure(EntityTypeBuilder<TransactionPersonalBudgetInclusion> builder)
    {
        builder.ToTable("TransactionPersonalBudgetInclusions");
        builder.HasKey(item => new { item.TransactionId, item.UserId });
        builder.HasIndex(item => new { item.UserId, item.TransactionId });
        builder.HasOne<ApplicationUser>().WithMany().HasForeignKey(item => item.UserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
