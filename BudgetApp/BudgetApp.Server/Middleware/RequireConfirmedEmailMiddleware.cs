using BudgetApp.Infrastructure.Identity;
using BudgetApp.Server.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace BudgetApp.Server.Middleware;

/// <summary>Default-deny app APIs for unverified sessions without altering any user data.</summary>
public sealed class RequireConfirmedEmailMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, UserManager<ApplicationUser> users)
    {
        var endpoint = context.GetEndpoint();
        if (!context.Request.Path.StartsWithSegments("/api") ||
            context.User.Identity?.IsAuthenticated != true ||
            endpoint?.Metadata.GetMetadata<IAllowAnonymous>() is not null ||
            endpoint?.Metadata.GetMetadata<AllowUnverifiedEmailAttribute>() is not null)
        {
            await next(context);
            return;
        }

        var user = await users.GetUserAsync(context.User);
        if (user is null)
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return;
        }
        if (!user.EmailConfirmed)
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            await context.Response.WriteAsJsonAsync(new ProblemDetails
            {
                Status = StatusCodes.Status403Forbidden,
                Title = "Email confirmation required",
                Detail = "Confirm your email address to access MC Budget. Your existing data is kept unchanged.",
                Extensions = { ["code"] = "EmailConfirmationRequired" }
            }, context.RequestAborted);
            return;
        }
        await next(context);
    }
}
