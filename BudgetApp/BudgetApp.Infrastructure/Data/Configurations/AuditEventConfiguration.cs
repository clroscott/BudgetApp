using BudgetApp.Domain.Auditing;
using BudgetApp.Domain.Households;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BudgetApp.Infrastructure.Data.Configurations;

internal sealed class AuditEventConfiguration
    : IEntityTypeConfiguration<AuditEvent>
{
    public void Configure(EntityTypeBuilder<AuditEvent> builder)
    {
        builder.ToTable("AuditEvents", table =>
        {
            table.HasCheckConstraint(
                "CK_AuditEvents_PersonalOwner",
                "([Visibility] = 'Personal' AND [OwnerUserId] IS NOT NULL) OR " +
                "([Visibility] = 'Household' AND [OwnerUserId] IS NULL)");
        });

        builder.HasKey(auditEvent => auditEvent.Id);

        builder.HasIndex(auditEvent => new
        {
            auditEvent.HouseholdId,
            auditEvent.OccurredAtUtc
        });

        builder.HasIndex(auditEvent => new
        {
            auditEvent.HouseholdId,
            auditEvent.OwnerUserId,
            auditEvent.OccurredAtUtc
        });

        builder.Property(auditEvent => auditEvent.Visibility)
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsUnicode(false)
            .IsRequired();

        builder.Property(auditEvent => auditEvent.Action)
            .HasMaxLength(AuditEvent.ActionMaxLength)
            .IsUnicode(false)
            .IsRequired();

        builder.Property(auditEvent => auditEvent.EntityType)
            .HasMaxLength(AuditEvent.EntityTypeMaxLength)
            .IsUnicode(false)
            .IsRequired();

        builder.Property(auditEvent => auditEvent.Summary)
            .HasMaxLength(AuditEvent.SummaryMaxLength)
            .IsRequired();

        builder.Property(auditEvent => auditEvent.DetailsJson);

        builder.Property(auditEvent => auditEvent.OccurredAtUtc)
            .HasConversion(
                value => value.UtcDateTime,
                value => new DateTimeOffset(
                    DateTime.SpecifyKind(value, DateTimeKind.Utc)))
            .IsRequired();

        builder.HasOne<Household>()
            .WithMany()
            .HasForeignKey(auditEvent => auditEvent.HouseholdId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
