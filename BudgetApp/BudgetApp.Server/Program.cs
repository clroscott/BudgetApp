using BudgetApp.Infrastructure;
using BudgetApp.Infrastructure.Email;
using BudgetApp.Server.Configuration;
using BudgetApp.Server.Middleware;
using BudgetApp.Server.Security;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Logging;
using Serilog;
using Serilog.Events;
using System.Threading.RateLimiting;

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
    builder.Services.AddControllers(options =>
        options.Filters.Add<ValidateAntiforgeryHeaderFilter>());
    builder.Services.AddAuthentication(IdentityConstants.ApplicationScheme)
        .AddIdentityCookies();
    builder.Services.ConfigureApplicationCookie(options =>
    {
        options.Cookie.Name = "__Host-BudgetApp.Auth";
        options.Cookie.HttpOnly = true;
        options.Cookie.IsEssential = true;
        options.Cookie.SameSite = SameSiteMode.Strict;
        options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
        options.ExpireTimeSpan = TimeSpan.FromHours(8);
        options.SlidingExpiration = true;
        options.Events = new CookieAuthenticationEvents
        {
            OnRedirectToLogin = context =>
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return Task.CompletedTask;
            },
            OnRedirectToAccessDenied = context =>
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                return Task.CompletedTask;
            }
        };
    });
    builder.Services.AddAuthorization();
    builder.Services.AddAntiforgery(options =>
    {
        options.HeaderName = "X-XSRF-TOKEN";
        options.Cookie.Name = "__Host-BudgetApp.Antiforgery";
        options.Cookie.HttpOnly = true;
        options.Cookie.IsEssential = true;
        options.Cookie.SameSite = SameSiteMode.Strict;
        options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
    });
    builder.Services.AddRateLimiter(options =>
    {
        options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
        var authenticationPermitLimit =
            builder.Configuration.GetValue<int?>(
                "AuthenticationRateLimit:PermitLimit") ?? 10;
        options.AddPolicy("authentication", context =>
            RateLimitPartition.GetFixedWindowLimiter(
                context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = authenticationPermitLimit,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0,
                    AutoReplenishment = true
                }));
    });
    // Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
    builder.Services.AddOpenApi();
    var connectionString =
        builder.Configuration.GetConnectionString("BudgetApp")
        ?? throw new InvalidOperationException(
            "Connection string 'BudgetApp' is not configured.");
    var databaseEnvironment = DatabaseEnvironmentGuard.Validate(
        builder.Environment.EnvironmentName,
        connectionString,
        builder.Configuration["DatabaseSafety:ExpectedDatabase"]);
    var emailOptions =
        builder.Configuration.GetSection("Email").Get<EmailOptions>()
        ?? new EmailOptions();
    var applicationUrlOptions =
        builder.Configuration.GetSection("Application").Get<ApplicationUrlOptions>()
        ?? new ApplicationUrlOptions();

    builder.Services.AddInfrastructure(
            connectionString,
            emailOptions,
            applicationUrlOptions,
            builder.Environment.IsDevelopment())
        .AddDefaultTokenProviders()
        .AddSignInManager();
    builder.Services.Configure<DataProtectionTokenProviderOptions>(options =>
        options.TokenLifespan =
            BudgetApp.Infrastructure.Identity.PasswordRecoveryService.TokenLifespan);

    var app = builder.Build();

    app.Logger.LogInformation(
        "Starting BudgetApp.Server in {EnvironmentName}, configured for SQL Server " +
        "{DatabaseServer} and database {DatabaseName}",
        app.Environment.EnvironmentName,
        databaseEnvironment.ServerName,
        databaseEnvironment.DatabaseName);

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

    app.UseRouting();

    app.UseRateLimiter();

    app.UseAuthentication();

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
catch (Exception exception) when (exception is not HostAbortedException)
{
    Log.Fatal(exception, "BudgetApp.Server terminated unexpectedly");
    Environment.ExitCode = 1;
}
finally
{
    Log.CloseAndFlush();
}

public partial class Program;
