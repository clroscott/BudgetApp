using BudgetApp.Infrastructure;
using BudgetApp.Server.Middleware;
using Microsoft.Extensions.Logging;
using Serilog;
using Serilog.Events;

var builder = WebApplication.CreateBuilder(args);
var errorLogPath = Path.Combine(
    builder.Environment.ContentRootPath,
    "logs",
    "budgetapp-errors-.log");

Log.Logger = new LoggerConfiguration()
    .ReadFrom.Configuration(builder.Configuration)
    .WriteTo.File(
        errorLogPath,
        restrictedToMinimumLevel: LogEventLevel.Error,
        rollingInterval: RollingInterval.Day,
        retainedFileCountLimit: 31,
        retainedFileTimeLimit: TimeSpan.FromDays(14),
        fileSizeLimitBytes: 10 * 1024 * 1024,
        rollOnFileSizeLimit: true,
        shared: true,
        flushToDiskInterval: TimeSpan.FromSeconds(1),
        outputTemplate: "{Timestamp:yyyy-MM-dd HH:mm:ss.fff zzz} [{Level:u3}] {SourceContext} TraceId={TraceId} SpanId={SpanId} {Message:lj}{NewLine}{Exception}")
    .CreateLogger();

try
{
    builder.Logging.Configure(options =>
        options.ActivityTrackingOptions =
            ActivityTrackingOptions.TraceId |
            ActivityTrackingOptions.SpanId);

    builder.Services.AddSerilog();
    builder.Services.AddControllers();
    // Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
    builder.Services.AddOpenApi();
    builder.Services.AddInfrastructure(
        builder.Configuration.GetConnectionString("BudgetApp")
            ?? throw new InvalidOperationException(
                "Connection string 'BudgetApp' is not configured."));

    var app = builder.Build();

    app.Logger.LogInformation(
        "Starting BudgetApp.Server in {EnvironmentName}",
        app.Environment.EnvironmentName);

    app.UseWhen(
        context => context.Request.Path.StartsWithSegments("/api"),
        branch => branch.UseMiddleware<ApiRequestLoggingMiddleware>());

    app.UseDefaultFiles();
    app.MapStaticAssets();

    // Configure the HTTP request pipeline.
    if (app.Environment.IsDevelopment())
    {
        app.MapOpenApi();
    }

    app.UseHttpsRedirection();

    app.UseAuthorization();

    app.MapControllers();

    app.MapFallbackToFile("/index.html");

    app.MapGet("/api/health", () => Results.Ok(new
    {
        status = "ok",
        app = "BudgetApp.Server"
    }));

    app.Run();
}
catch (Exception exception)
{
    Log.Fatal(exception, "BudgetApp.Server terminated unexpectedly");
    Environment.ExitCode = 1;
}
finally
{
    Log.CloseAndFlush();
}
