using BudgetApp.Domain.Categories;
using BudgetApp.Domain.Households;
using BudgetApp.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Infrastructure.Data;

public sealed class BudgetAppDbContext(DbContextOptions<BudgetAppDbContext> options)
    : IdentityUserContext<ApplicationUser, Guid>(options)
{
    public DbSet<Category> Categories => Set<Category>();

    public DbSet<Household> Households => Set<Household>();

    public DbSet<HouseholdMember> HouseholdMembers => Set<HouseholdMember>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<ApplicationUser>()
            .Property(user => user.DisplayName)
            .HasMaxLength(100)
            .IsRequired();

        builder.ApplyConfigurationsFromAssembly(typeof(BudgetAppDbContext).Assembly);
    }
}
