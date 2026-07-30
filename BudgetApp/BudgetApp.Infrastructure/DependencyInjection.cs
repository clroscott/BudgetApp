using BudgetApp.Application.Accounts;
using BudgetApp.Application.Authentication;
using BudgetApp.Application.Auditing;
using BudgetApp.Application.Categories;
using BudgetApp.Application.CategorizationRules;
using BudgetApp.Application.Dashboards;
using BudgetApp.Application.Budgets;
using BudgetApp.Application.Email;
using BudgetApp.Application.Households;
using BudgetApp.Application.Imports;
using BudgetApp.Application.RecurringExpenses;
using BudgetApp.Application.Transactions;
using BudgetApp.Infrastructure.Accounts;
using BudgetApp.Infrastructure.Auditing;
using BudgetApp.Infrastructure.Categories;
using BudgetApp.Infrastructure.CategorizationRules;
using BudgetApp.Infrastructure.Dashboards;
using BudgetApp.Infrastructure.Budgets;
using BudgetApp.Infrastructure.Data;
using BudgetApp.Infrastructure.Email;
using BudgetApp.Infrastructure.Households;
using BudgetApp.Infrastructure.Identity;
using BudgetApp.Infrastructure.Imports;
using BudgetApp.Infrastructure.RecurringExpenses;
using BudgetApp.Infrastructure.Transactions;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace BudgetApp.Infrastructure;

public static class DependencyInjection
{
    public static IdentityBuilder AddInfrastructure(
        this IServiceCollection services,
        string connectionString,
        EmailOptions emailOptions,
        ApplicationUrlOptions applicationUrlOptions,
        bool allowDevelopmentFileEmail)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(connectionString);
        ArgumentNullException.ThrowIfNull(emailOptions);
        ArgumentNullException.ThrowIfNull(applicationUrlOptions);

        services.AddDbContext<BudgetAppDbContext>(options =>
            options.UseSqlServer(connectionString));
        services.AddScoped<IAccountRepository, AccountRepository>();
        services.AddScoped<AccountManagementService>();
        services.AddScoped<IAuditRepository, AuditRepository>();
        services.AddScoped<AuditWriter>();
        services.AddScoped<AuditQueryService>();
        services.AddScoped<ICategoryRepository, CategoryRepository>();
        services.AddScoped<CategoryManagementService>();
        services.AddScoped<ICategorizationRuleRepository, CategorizationRuleRepository>();
        services.AddScoped<CategorizationRuleManagementService>();
        services.AddScoped<IDashboardLayoutRepository, DashboardLayoutRepository>();
        services.AddScoped<DashboardLayoutService>();
        services.AddScoped<IBudgetRepository, BudgetRepository>();
        services.AddScoped<BudgetManagementService>();
        services.AddScoped<AnnualBudgetOverviewService>();
        services.AddScoped<IYearlyPlanRepository, YearlyPlanRepository>();
        services.AddScoped<YearlyPlanService>();
        services.AddScoped<IHouseholdRepository, HouseholdRepository>();
        services.AddScoped<IHouseholdInvitationRepository, HouseholdInvitationRepository>();
        services.AddScoped<IHouseholdLifecycleRepository, HouseholdLifecycleRepository>();
        services.AddSingleton<
            IHouseholdInvitationTokenService,
            HouseholdInvitationTokenService>();
        services.AddScoped<IHouseholdAuthorizationRepository, HouseholdAuthorizationRepository>();
        services.AddScoped<HouseholdAuthorizationService>();
        services.AddScoped<HouseholdInvitationService>();
        services.AddScoped<HouseholdLifecycleService>();
        services.AddScoped<HouseholdOnboardingService>();
        services.AddScoped<IImportRepository, ImportRepository>();
        services.AddScoped<IImportProfileRepository, ImportProfileRepository>();
        services.AddScoped<ImportProfileService>();
        services.AddScoped<ICsvImportReader, CsvImportReader>();
        services.AddScoped<CsvImportService>();
        services.AddScoped<ImportReviewService>();
        services.AddScoped<IRecurringExpenseRepository, RecurringExpenseRepository>();
        services.AddScoped<RecurringExpenseManagementService>();
        services.AddScoped<ITransactionRepository, TransactionRepository>();
        services.AddScoped<TransactionManagementService>();
        services.AddScoped<TransactionCsvExportService>();
        services.AddScoped<IPasswordRecoveryService, PasswordRecoveryService>();
        services.AddSingleton(TimeProvider.System);
        AddEmailInfrastructure(
            services,
            emailOptions,
            applicationUrlOptions,
            allowDevelopmentFileEmail);

        return services
            .AddIdentityCore<ApplicationUser>(options =>
            {
                options.User.RequireUniqueEmail = true;
                options.SignIn.RequireConfirmedAccount = false;

                options.Password.RequiredLength = 12;
                options.Password.RequireDigit = false;
                options.Password.RequireLowercase = false;
                options.Password.RequireNonAlphanumeric = false;
                options.Password.RequireUppercase = false;

                options.Lockout.AllowedForNewUsers = true;
                options.Lockout.MaxFailedAccessAttempts = 5;
                options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
            })
            .AddEntityFrameworkStores<BudgetAppDbContext>();
    }

    private static void AddEmailInfrastructure(
        IServiceCollection services,
        EmailOptions emailOptions,
        ApplicationUrlOptions applicationUrlOptions,
        bool allowDevelopmentFileEmail)
    {
        var mode = emailOptions.DeliveryMode.Trim();
        if (!mode.Equals(EmailOptions.DisabledMode, StringComparison.OrdinalIgnoreCase) &&
            !mode.Equals(EmailOptions.FileMode, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                "Email:DeliveryMode must be 'Disabled' or 'File'.");
        }

        if (mode.Equals(EmailOptions.FileMode, StringComparison.OrdinalIgnoreCase) &&
            !allowDevelopmentFileEmail)
        {
            throw new InvalidOperationException(
                "File email delivery is permitted only in the Development environment.");
        }

        services.AddSingleton(emailOptions);
        services.AddSingleton(applicationUrlOptions);
        services.AddSingleton<IApplicationEmailLinkBuilder, ApplicationEmailLinkBuilder>();
        services.AddSingleton<EmailTemplateFactory>();
        services.AddSingleton<EmailDispatchService>();

        if (mode.Equals(EmailOptions.FileMode, StringComparison.OrdinalIgnoreCase))
        {
            services.AddSingleton<IEmailSender, FileEmailSender>();
        }
        else
        {
            services.AddSingleton<IEmailSender, DisabledEmailSender>();
        }
    }
}
