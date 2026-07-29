using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.Budgeting;
using BudgetApp.Domain.CategorizationRules;
using BudgetApp.Domain.Categories;
using BudgetApp.Domain.Dashboards;
using BudgetApp.Domain.Households;
using BudgetApp.Domain.Imports;
using BudgetApp.Domain.RecurringExpenses;
using BudgetApp.Domain.Transactions;
using BudgetApp.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Infrastructure.Data;

public sealed class BudgetAppDbContext(DbContextOptions<BudgetAppDbContext> options)
    : IdentityUserContext<ApplicationUser, Guid>(options)
{
    public DbSet<Account> Accounts => Set<Account>();

    public DbSet<BudgetLine> BudgetLines => Set<BudgetLine>();

    public DbSet<BudgetMonth> BudgetMonths => Set<BudgetMonth>();

    public DbSet<Category> Categories => Set<Category>();

    public DbSet<CategorizationRule> CategorizationRules =>
        Set<CategorizationRule>();

    public DbSet<DashboardLayout> DashboardLayouts => Set<DashboardLayout>();

    public DbSet<DashboardPanelPreference> DashboardPanelPreferences =>
        Set<DashboardPanelPreference>();

    public DbSet<Household> Households => Set<Household>();

    public DbSet<HouseholdMember> HouseholdMembers => Set<HouseholdMember>();

    public DbSet<ImportFile> ImportFiles => Set<ImportFile>();

    public DbSet<ImportProfile> ImportProfiles => Set<ImportProfile>();

    public DbSet<ImportTransactionDraft> ImportTransactionDrafts =>
        Set<ImportTransactionDraft>();

    public DbSet<RecurringExpense> RecurringExpenses => Set<RecurringExpense>();

    public DbSet<Transaction> Transactions => Set<Transaction>();

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
