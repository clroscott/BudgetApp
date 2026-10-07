using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BudgetApp.Infrastructure.Administration;

// Separate from household activity; no credentials, tokens, codes, or financial data.
public sealed class AdministrativeAuditEvent
{
    public Guid Id { get; set; }
    public Guid ActorUserId { get; set; }
    public Guid TargetUserId { get; set; }
    public string Action { get; set; } = "";
    public string Reason { get; set; } = "";
    public string Outcome { get; set; } = "";
    public string ContextHash { get; set; } = "";
    public DateTimeOffset OccurredAtUtc { get; set; }
}

internal sealed class AdministrativeAuditEventConfiguration : IEntityTypeConfiguration<AdministrativeAuditEvent>
{
    public void Configure(EntityTypeBuilder<AdministrativeAuditEvent> builder)
    {
        builder.ToTable("AdministrativeAuditEvents");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Action).HasMaxLength(50).IsRequired();
        builder.Property(x => x.Reason).HasMaxLength(500).IsRequired();
        builder.Property(x => x.Outcome).HasMaxLength(50).IsRequired();
        builder.Property(x => x.ContextHash).HasMaxLength(64).IsRequired();
        builder.Property(x => x.OccurredAtUtc).HasConversion(x => x.UtcTicks, x => new DateTimeOffset(x, TimeSpan.Zero));
        builder.HasIndex(x => new { x.OccurredAtUtc, x.Id });
        builder.HasIndex(x => new { x.TargetUserId, x.Action, x.OccurredAtUtc });
    }
}
