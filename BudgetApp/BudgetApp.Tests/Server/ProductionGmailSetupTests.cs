namespace BudgetApp.Tests.Server;

public sealed class ProductionGmailSetupTests
{
    [Fact]
    public async Task WindowsSetupProtectsCredentialsAndEmitsSafeStartupSettings()
    {
        if (!OperatingSystem.IsWindows()) return;
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory != null && !File.Exists(Path.Combine(directory.FullName, "tools", "tests", "configure-production-gmail.tests.ps1"))) directory = directory.Parent;
        Assert.NotNull(directory);
        var script = Path.Combine(directory!.FullName, "tools", "tests", "configure-production-gmail.tests.ps1");
        var start = new System.Diagnostics.ProcessStartInfo("powershell.exe") { RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true };
        foreach (var argument in new[] { "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script }) start.ArgumentList.Add(argument);
        using var process = System.Diagnostics.Process.Start(start)!;
        var output = process.StandardOutput.ReadToEndAsync();
        var error = process.StandardError.ReadToEndAsync();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        try { await process.WaitForExitAsync(timeout.Token); }
        catch (OperationCanceledException) { process.Kill(entireProcessTree: true); throw; }
        Assert.True(process.ExitCode == 0, await error);
        Assert.Contains("Production Gmail setup checks passed", await output);
    }
}
