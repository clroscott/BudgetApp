using BudgetApp.Domain.Tutorials;
using BudgetApp.Infrastructure.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BudgetApp.Infrastructure.Data.Configurations;

internal sealed class TutorialProgressConfiguration
    : IEntityTypeConfiguration<TutorialProgress>
{
    public void Configure(EntityTypeBuilder<TutorialProgress> builder)
    {
        builder.ToTable("TutorialProgress");
        builder.HasKey(progress => progress.Id);
        builder.HasIndex(progress => new
        {
            progress.UserId,
            progress.TutorialKey,
            progress.TutorialVersion
        }).IsUnique();

        builder.Property(progress => progress.TutorialKey)
            .HasMaxLength(TutorialProgress.TutorialKeyMaxLength)
            .IsRequired();
        builder.Property(progress => progress.TutorialVersion).IsRequired();
        builder.Property(progress => progress.Status)
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();
        builder.Property(progress => progress.CurrentStepIndex).IsRequired();
        builder.Property(progress => progress.StartedAtUtc).IsRequired();
        builder.Property(progress => progress.UpdatedAtUtc).IsRequired();

        builder.HasOne<ApplicationUser>()
            .WithMany()
            .HasForeignKey(progress => progress.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
