using BudgetApp.Infrastructure;
using BudgetApp.Infrastructure.Email;
using BudgetApp.Server.Configuration;
using BudgetApp.Server.Middleware;
using BudgetApp.Server.Security;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using BudgetApp.Infrastructure.Administration;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Logging;
using Serilog;
using Serilog.Events;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.ConfigureKestrel(options =>
    options.AddServerHeader = false);

// Development must always use its local User Secrets configuration. Reload it
// after the default providers so an inherited Production environment variable
// cannot redirect Visual Studio to the real household database.
if (builder.Environment.IsDevelopment())
{
    builder.Configuration.AddUserSecrets(
        typeof(DatabaseEnvironmentGuard).Assembly,
        optional: true,
        reloadOnChange: true);
}

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
    var applicationKeyRing = ApplicationKeyRing.Register(builder.Services, builder.Configuration, builder.Environment);
    if (KeyRingMaintenanceCommand.TryRun(builder, args, applicationKeyRing)) return;
    builder.Services.AddControllers(options =>
        options.Filters.Add<ValidateAntiforgeryHeaderFilter>());
    builder.Services.AddAuthentication(IdentityConstants.ApplicationScheme)
        .AddIdentityCookies();
    builder.Services.Configure<CookieAuthenticationOptions>(IdentityConstants.TwoFactorUserIdScheme, options =>
    {
        options.Cookie.Name = "__Host-BudgetApp.Verification";
        options.Cookie.HttpOnly = true;
        options.Cookie.IsEssential = true;
        options.Cookie.SameSite = SameSiteMode.Strict;
        options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
        options.ExpireTimeSpan = BudgetApp.Infrastructure.Identity.LoginVerificationService.ChallengeLifetime;
        options.SlidingExpiration = false;
    });
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
            OnValidatePrincipal = async context =>
            {
                await SecurityStampValidator.ValidatePrincipalAsync(context);
                if (context.Principal?.Identity?.IsAuthenticated != true) return;
                var users = context.HttpContext.RequestServices.GetRequiredService<UserManager<BudgetApp.Infrastructure.Identity.ApplicationUser>>();
                var user = await users.GetUserAsync(context.Principal);
                if (user?.TwoFactorEnabled == true && !context.Principal.HasClaim("amr", "mfa"))
                {
                    context.RejectPrincipal();
                    await context.HttpContext.SignOutAsync(IdentityConstants.ApplicationScheme);
                }
            },
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
    // Password and email-address changes invalidate other sessions immediately.
    builder.Services.Configure<SecurityStampValidatorOptions>(options =>
    {
        options.ValidationInterval = TimeSpan.Zero;
        // Identity rebuilds principals on stamp validation. Preserve proof from the
        // validated cookie, never manufacture it from the account's enabled flag.
        options.OnRefreshingPrincipal = context =>
        {
            if (context.CurrentPrincipal?.HasClaim("amr", "mfa") == true &&
                context.NewPrincipal?.Identity is System.Security.Claims.ClaimsIdentity identity)
                identity.AddClaim(new System.Security.Claims.Claim("amr", "mfa"));
            return Task.CompletedTask;
        };
    });
    builder.Services.AddScoped<IAuthorizationHandler, ApplicationAdministratorAuthorization>();
    builder.Services.AddAuthorization(options => {
        options.AddPolicy("ApplicationAdministrator", policy => policy.RequireAuthenticatedUser().AddRequirements(new ApplicationAdministratorRequirement()));
        options.AddPolicy("ApplicationOwner", policy => policy.RequireAuthenticatedUser().AddRequirements(new ApplicationAdministratorRequirement(OwnerOnly: true)));
    });
    builder.Services.AddHsts(options =>
    {
        options.MaxAge = TimeSpan.FromDays(180);
        options.IncludeSubDomains = false;
        options.Preload = false;
    });
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
        options.OnRejected = async (context, cancellationToken) =>
        {
            var seconds = context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter)
                ? Math.Max(1, (int)Math.Ceiling(retryAfter.TotalSeconds)) : 60;
            context.HttpContext.Response.Headers.RetryAfter = seconds.ToString(System.Globalization.CultureInfo.InvariantCulture);
            await context.HttpContext.Response.WriteAsJsonAsync(new Microsoft.AspNetCore.Mvc.ProblemDetails
            {
                Status = StatusCodes.Status429TooManyRequests,
                Title = "Too many requests",
                Detail = $"Wait {seconds} seconds, then try again. No action was processed."
            }, cancellationToken);
        };
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
        options.AddPolicy("emailOwnership", context =>
            RateLimitPartition.GetFixedWindowLimiter(
                context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ??
                    context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = builder.Configuration.GetValue<int?>("EmailOwnershipRateLimit:PermitLimit") ?? 5,
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

    // Validate retained keys before accepting a request or running owner setup.
    applicationKeyRing.Verify(app.Services);

    // Local setup mode exits without opening any web listener or bootstrap API.
    if (await ApplicationOwnerSetupCommand.TryRunAsync(app, args, databaseEnvironment)) return;
    if (builder.Configuration.GetSection("AppAdministration:AdministratorUserIds").GetChildren().Any())
        app.Logger.LogWarning("Legacy configured administrator IDs are ignored. Application-administrator grants now come only from the database; use the initial-owner setup tool or owner interface.");

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

    app.UseMiddleware<SecurityHeadersMiddleware>();

    // Configure the HTTP request pipeline.
    if (app.Environment.IsDevelopment())
    {
        app.MapOpenApi();
    }

    if (!app.Environment.IsDevelopment() &&
        !app.Environment.IsEnvironment("Testing"))
    {
        app.UseHsts();
    }

    app.UseHttpsRedirection();

    app.UseRouting();

    app.UseAuthentication();

    app.UseRateLimiter();

    // Account maintenance remains available; every other app API needs verified ownership.
    app.UseMiddleware<RequireConfirmedEmailMiddleware>();

    app.UseAuthorization();

    app.MapControllers();

    app.MapFallbackToFile("/index.html");

    app.MapGet("/api/health", () => Results.Ok(new
    {
        status = "ok",
        app = "BudgetApp.Server"
    })).AllowAnonymous();

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
