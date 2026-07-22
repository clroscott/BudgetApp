using BudgetApp.Application.Accounts;
using BudgetApp.Application.Categories;
using BudgetApp.Application.Budgets;
using BudgetApp.Application.Households;
using BudgetApp.Application.Imports;
using BudgetApp.Application.Transactions;
using BudgetApp.Infrastructure.Accounts;
using BudgetApp.Infrastructure.Categories;
using BudgetApp.Infrastructure.Budgets;
using BudgetApp.Infrastructure.Data;
using BudgetApp.Infrastructure.Households;
using BudgetApp.Infrastructure.Identity;
using BudgetApp.Infrastructure.Imports;
using BudgetApp.Infrastructure.Transactions;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace BudgetApp.Infrastructure;

public static class DependencyInjection
{
    public static IdentityBuilder AddInfrastructure(
        this IServiceCollection services,
        string connectionString)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(connectionString);

        services.AddDbContext<BudgetAppDbContext>(options =>
            options.UseSqlServer(connectionString));
        services.AddScoped<IAccountRepository, AccountRepository>();
        services.AddScoped<AccountManagementService>();
        services.AddScoped<ICategoryRepository, CategoryRepository>();
        services.AddScoped<CategoryManagementService>();
        services.AddScoped<IBudgetRepository, BudgetRepository>();
        services.AddScoped<BudgetManagementService>();
        services.AddScoped<IHouseholdRepository, HouseholdRepository>();
        services.AddScoped<IHouseholdAuthorizationRepository, HouseholdAuthorizationRepository>();
        services.AddScoped<HouseholdAuthorizationService>();
        services.AddScoped<HouseholdOnboardingService>();
        services.AddScoped<IImportRepository, ImportRepository>();
        services.AddScoped<ICsvImportReader, CsvImportReader>();
        services.AddScoped<CsvImportService>();
        services.AddScoped<ImportReviewService>();
        services.AddScoped<ITransactionRepository, TransactionRepository>();
        services.AddScoped<TransactionManagementService>();
        services.AddSingleton(TimeProvider.System);

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
}
