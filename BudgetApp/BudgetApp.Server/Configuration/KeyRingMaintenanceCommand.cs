namespace BudgetApp.Server.Configuration;

public static class KeyRingMaintenanceCommand
{
    public static bool TryRun(WebApplicationBuilder builder, string[] args, ApplicationKeyRing ring)
    {
        var index = Array.IndexOf(args, "--key-ring");
        if (index < 0) return false;
        try
        {
            if (!ring.IsProduction || index + 1 >= args.Length)
                throw new InvalidOperationException("Use --key-ring initialize/check/write-probe/verify-probe with the documented Windows Production settings.");
            using var app = builder.Build(); // no listener, database, Identity, or email sender is started.
            var operation = args[index + 1];
            Console.WriteLine($"Data Protection maintenance only\nEnvironment: {ring.EnvironmentName}\nApplication: {ring.ApplicationName}\nKey directory: {ring.DirectoryPath}");
            switch (operation)
            {
                case "initialize":
                    Console.WriteLine("First-install initialization uses a new ring. Existing cookies and Identity links will not carry over from the former default ring. Financial data is not changed.");
                    Console.Write("Type INITIALIZE KEYS to continue (anything else cancels): ");
                    if (Console.ReadLine() != "INITIALIZE KEYS") throw new InvalidOperationException("Initialization canceled. No keys were created.");
                    ring.Initialize(app.Services);
                    break;
                case "check": ring.Verify(app.Services); break;
                case "write-probe": ring.WriteProbe(app.Services, ProbeFile(args)); break;
                case "verify-probe": ring.VerifyProbe(app.Services, ProbeFile(args)); break;
                default: throw new InvalidOperationException("Unknown key-ring operation. Nothing was changed.");
            }
            Console.WriteLine("READY: key-ring operation completed. No database or email operation was performed.");
        }
        catch (InvalidOperationException error) { Console.Error.WriteLine(error.Message); Environment.ExitCode = 1; }
        catch (Exception)
        {
            Console.Error.WriteLine("Key-ring maintenance failed. Check the documented configuration, permissions, and recovery material. No automatic retry or replacement was attempted.");
            Environment.ExitCode = 1;
        }
        return true;
    }

    private static string ProbeFile(string[] args)
    {
        var index = Array.IndexOf(args, "--probe-file");
        if (index < 0 || index + 1 >= args.Length || !Path.IsPathFullyQualified(args[index + 1]))
            throw new InvalidOperationException("--probe-file requires an absolute file path. Write-probe never overwrites an existing file.");
        return args[index + 1];
    }
}
