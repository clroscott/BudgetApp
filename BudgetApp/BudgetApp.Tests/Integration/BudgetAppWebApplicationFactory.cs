using System.Data.Common;
using BudgetApp.Application.Email;
using BudgetApp.Infrastructure.Data;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace BudgetApp.Tests.Integration;

public sealed class BudgetAppWebApplicationFactory : WebApplicationFactory<Program>
{
    private readonly SqliteConnection connection = new("Data Source=:memory:");
    private readonly object databaseLock = new();
    private bool databaseCreated;

    public BudgetAppWebApplicationFactory()
    {
        connection.Open();
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:BudgetApp", "Data Source=integration-tests");
        builder.UseSetting("AuthenticationRateLimit:PermitLimit", "1000");

        builder.ConfigureServices(services =>
        {
            services.RemoveAll<DbContextOptions<BudgetAppDbContext>>();
            services.RemoveAll<IDbContextOptionsConfiguration<BudgetAppDbContext>>();
            services.RemoveAll<IEmailSender>();

            services.AddDataProtection()
                .UseEphemeralDataProtectionProvider();
            services.AddSingleton<DbConnection>(connection);
            services.AddDbContext<BudgetAppDbContext>((serviceProvider, options) =>
                options.UseSqlite(serviceProvider.GetRequiredService<DbConnection>()));
            services.AddSingleton<RecordingEmailSender>();
            services.AddSingleton<IEmailSender>(serviceProvider =>
                serviceProvider.GetRequiredService<RecordingEmailSender>());
        });
    }

    public HttpClient CreateAuthenticatedTestClient()
    {
        var client = CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            BaseAddress = new Uri("https://localhost"),
            HandleCookies = true
        });

        EnsureDatabaseCreated();
        return client;
    }

    private void EnsureDatabaseCreated()
    {
        lock (databaseLock)
        {
            if (databaseCreated)
            {
                return;
            }

            using var scope = Services.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<BudgetAppDbContext>();
            dbContext.Database.EnsureCreated();
            databaseCreated = true;
        }
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);

        if (disposing)
        {
            connection.Dispose();
        }
    }
}
