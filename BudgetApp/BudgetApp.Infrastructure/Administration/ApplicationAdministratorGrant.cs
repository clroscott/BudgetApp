using BudgetApp.Infrastructure.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BudgetApp.Infrastructure.Administration;

public enum ApplicationAdministratorRole { InstallationOwner, SupportAdministrator }
public sealed class ApplicationAdministratorGrant
{
    public Guid UserId { get; set; }
    public ApplicationAdministratorRole Role { get; set; }
    public string Version { get; set; } = Guid.NewGuid().ToString("N");
}
public sealed class ApplicationAdministrationState
{
    public int Id { get; set; } = 1;
    public bool BootstrapCompleted { get; set; }
}
internal sealed class ApplicationAdministratorGrantConfiguration : IEntityTypeConfiguration<ApplicationAdministratorGrant>
{
    public void Configure(EntityTypeBuilder<ApplicationAdministratorGrant> builder)
    {
        builder.ToTable("ApplicationAdministratorGrants");
        builder.HasKey(x => x.UserId);
        builder.Property(x => x.Role).HasConversion<string>().HasMaxLength(30).IsRequired();
        builder.Property(x => x.Version).HasMaxLength(32).IsConcurrencyToken().IsRequired();
        builder.HasOne<ApplicationUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
    }
}
internal sealed class ApplicationAdministrationStateConfiguration : IEntityTypeConfiguration<ApplicationAdministrationState>
{
    public void Configure(EntityTypeBuilder<ApplicationAdministrationState> builder)
    {
        builder.ToTable("ApplicationAdministrationState");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).ValueGeneratedNever();
        builder.HasData(new ApplicationAdministrationState { Id = 1, BootstrapCompleted = false });
    }
}
