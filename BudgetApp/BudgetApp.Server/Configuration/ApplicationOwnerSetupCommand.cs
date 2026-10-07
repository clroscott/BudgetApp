using System.ComponentModel.DataAnnotations;
using BudgetApp.Infrastructure.Administration;

namespace BudgetApp.Server.Configuration;

public static class ApplicationOwnerSetupCommand
{
    public static async Task<bool> TryRunAsync(WebApplication app, string[] args, DatabaseEnvironmentInfo database)
    {
        var index = Array.IndexOf(args, "--bootstrap-owner");
        if (index < 0) return false;
        try
        {
            if (index + 1 >= args.Length || !new EmailAddressAttribute().IsValid(args[index + 1]) ||
                !(app.Environment.IsDevelopment() || app.Environment.IsProduction()))
                throw new AdministrationException(400, "Use --bootstrap-owner followed by an existing account email, in Development or Production.");
            var address = args[index + 1].Trim();
            Console.WriteLine($"Initial INSTALLATION OWNER setup\nEnvironment: {app.Environment.EnvironmentName}\nSQL Server: {database.ServerName}\nDatabase: {database.DatabaseName}\nAccount: {address}");
            Console.WriteLine("This account must already have verified email and MFA. No financial data is changed. Setup cannot run again after completion.");
            Console.Write("Type SETUP OWNER to confirm (anything else cancels): ");
            if (Console.ReadLine() != "SETUP OWNER") { Console.WriteLine("Canceled. No administrator access was granted."); return true; }
            using var scope = app.Services.CreateScope();
            var result = await scope.ServiceProvider.GetRequiredService<ApplicationOwnerBootstrapService>().BootstrapAsync(address, CancellationToken.None);
            Console.WriteLine(result.Message);
        }
        catch (AdministrationException error) { Console.Error.WriteLine(error.Message); Environment.ExitCode = 1; }
        catch (Exception)
        {
            // Never print raw provider exceptions/connection strings here.
            Console.Error.WriteLine("Setup could not complete. Check that migrations have been applied to the displayed database and that SQL Server is available. No automatic retry was performed; check the administrative audit before repeating.");
            Environment.ExitCode = 1;
        }
        return true;
    }
}
