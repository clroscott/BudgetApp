using BudgetApp.Domain.Households;
using BudgetApp.Infrastructure.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BudgetApp.Infrastructure.Data.Configurations;

internal sealed class HouseholdInvitationConfiguration
    : IEntityTypeConfiguration<HouseholdInvitation>
{
    public void Configure(EntityTypeBuilder<HouseholdInvitation> builder)
    {
        builder.ToTable("HouseholdInvitations");

        builder.HasKey(invitation => invitation.Id);

        builder.HasIndex(invitation => invitation.TokenHash)
            .IsUnique();

        builder.HasIndex(invitation => new
            {
                invitation.HouseholdId,
                invitation.NormalizedEmail
            })
            .IsUnique()
            .HasFilter("[Status] = 'Pending'");

        builder.Property(invitation => invitation.Email)
            .HasMaxLength(HouseholdInvitation.EmailMaxLength)
            .IsRequired();

        builder.Property(invitation => invitation.NormalizedEmail)
            .HasMaxLength(HouseholdInvitation.EmailMaxLength)
            .IsRequired();

        builder.Property(invitation => invitation.TokenHash)
            .HasMaxLength(HouseholdInvitation.TokenHashLength)
            .IsUnicode(false)
            .IsFixedLength()
            .IsRequired();

        builder.Property(invitation => invitation.Role)
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsUnicode(false)
            .IsRequired();

        builder.Property(invitation => invitation.Status)
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsUnicode(false)
            .IsRequired();

        builder.HasOne(invitation => invitation.Household)
            .WithMany()
            .HasForeignKey(invitation => invitation.HouseholdId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne<ApplicationUser>()
            .WithMany()
            .HasForeignKey(invitation => invitation.InvitedByUserId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne<ApplicationUser>()
            .WithMany()
            .HasForeignKey(invitation => invitation.AcceptedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
