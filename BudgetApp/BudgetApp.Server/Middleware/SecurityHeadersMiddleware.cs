namespace BudgetApp.Server.Middleware;

public sealed class SecurityHeadersMiddleware(RequestDelegate next)
{
    private const string ContentSecurityPolicy =
        "default-src 'self'; " +
        "base-uri 'self'; " +
        "connect-src 'self'; " +
        "font-src 'self'; " +
        "form-action 'self'; " +
        "frame-ancestors 'none'; " +
        "img-src 'self' data:; " +
        "object-src 'none'; " +
        "script-src 'self'; " +
        "style-src 'self' 'unsafe-inline'";

    public async Task InvokeAsync(HttpContext context)
    {
        context.Response.OnStarting(() =>
        {
            var headers = context.Response.Headers;
            headers.ContentSecurityPolicy = ContentSecurityPolicy;
            headers.XContentTypeOptions = "nosniff";
            headers.XFrameOptions = "DENY";
            headers["Referrer-Policy"] = "no-referrer";
            headers["Permissions-Policy"] =
                "camera=(), geolocation=(), microphone=(), payment=(), usb=()";
            headers["Cross-Origin-Opener-Policy"] = "same-origin";
            headers["Cross-Origin-Resource-Policy"] = "same-origin";
            headers["X-Permitted-Cross-Domain-Policies"] = "none";

            if (context.Request.Path.StartsWithSegments("/api"))
            {
                headers.CacheControl = "no-store";
                headers.Pragma = "no-cache";
            }

            return Task.CompletedTask;
        });

        await next(context);
    }
}
