using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.Auditing;
using BudgetApp.Domain.Budgeting;
using BudgetApp.Domain.CategorizationRules;
using BudgetApp.Domain.Categories;
using BudgetApp.Domain.Dashboards;
using BudgetApp.Domain.Households;
using BudgetApp.Domain.Imports;
using BudgetApp.Domain.RecurringExpenses;
using BudgetApp.Domain.Transactions;
using BudgetApp.Domain.Tutorials;
using BudgetApp.Infrastructure.Identity;
using BudgetApp.Infrastructure.Administration;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Infrastructure.Data;

public sealed class BudgetAppDbContext(DbContextOptions<BudgetAppDbContext> options)
    : IdentityUserContext<ApplicationUser, Guid>(options)
{
    public DbSet<Account> Accounts => Set<Account>();

    public DbSet<AuditEvent> AuditEvents => Set<AuditEvent>();
    public DbSet<AdministrativeAuditEvent> AdministrativeAuditEvents => Set<AdministrativeAuditEvent>();
    public DbSet<ApplicationAdministratorGrant> ApplicationAdministratorGrants => Set<ApplicationAdministratorGrant>();
    public DbSet<ApplicationAdministrationState> ApplicationAdministrationStates => Set<ApplicationAdministrationState>();

    public DbSet<BudgetLine> BudgetLines => Set<BudgetLine>();

    public DbSet<BudgetMonth> BudgetMonths => Set<BudgetMonth>();

    public DbSet<Category> Categories => Set<Category>();

    public DbSet<CategorizationRule> CategorizationRules =>
        Set<CategorizationRule>();

    public DbSet<DashboardLayout> DashboardLayouts => Set<DashboardLayout>();

    public DbSet<DashboardPanelPreference> DashboardPanelPreferences =>
        Set<DashboardPanelPreference>();

    public DbSet<Household> Households => Set<Household>();

    public DbSet<HouseholdInvitation> HouseholdInvitations =>
        Set<HouseholdInvitation>();

    public DbSet<HouseholdMember> HouseholdMembers => Set<HouseholdMember>();

    public DbSet<ImportFile> ImportFiles => Set<ImportFile>();

    public DbSet<ImportProfile> ImportProfiles => Set<ImportProfile>();

    public DbSet<ImportTransactionDraft> ImportTransactionDrafts =>
        Set<ImportTransactionDraft>();

    public DbSet<RecurringExpense> RecurringExpenses => Set<RecurringExpense>();

    public DbSet<Transaction> Transactions => Set<Transaction>();

    public DbSet<SavedTransactionFilter> SavedTransactionFilters => Set<SavedTransactionFilter>();

    public DbSet<TutorialProgress> TutorialProgress => Set<TutorialProgress>();

    public DbSet<YearlyPlan> YearlyPlans => Set<YearlyPlan>();

    public DbSet<YearlyTargetLine> YearlyTargetLines => Set<YearlyTargetLine>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<ApplicationUser>()
            .Property(user => user.DisplayName)
            .HasMaxLength(100)
            .IsRequired();

        builder.ApplyConfigurationsFromAssembly(typeof(BudgetAppDbContext).Assembly);

        // SQLite is the isolated test provider and cannot order DateTimeOffset.
        // Normalize only this sortable test column to UTC DateTime; SQL Server's
        // datetimeoffset mapping and Production schema remain unchanged.
        if (Database.ProviderName == "Microsoft.EntityFrameworkCore.Sqlite")
        {
            builder.Entity<ImportFile>().Property(file => file.UploadedAtUtc)
                .HasConversion(value => value.UtcDateTime,
                    value => new DateTimeOffset(DateTime.SpecifyKind(value, DateTimeKind.Utc)));
        }
    }
}
