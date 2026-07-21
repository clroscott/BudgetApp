using System.Diagnostics;

namespace BudgetApp.Server.Middleware;

public sealed class ApiRequestLoggingMiddleware(
    RequestDelegate next,
    ILogger<ApiRequestLoggingMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        var startedAt = Stopwatch.GetTimestamp();
        var traceId = Activity.Current?.TraceId.ToString() ?? context.TraceIdentifier;

        try
        {
            await next(context);

            logger.LogInformation(
                "HTTP {RequestMethod} {RequestPath} responded {StatusCode} in {ElapsedMilliseconds:F1} ms. TraceId: {TraceId}",
                context.Request.Method,
                context.Request.Path.Value,
                context.Response.StatusCode,
                Stopwatch.GetElapsedTime(startedAt).TotalMilliseconds,
                traceId);
        }
        catch (Exception exception)
        {
            logger.LogError(
                exception,
                "HTTP {RequestMethod} {RequestPath} failed in {ElapsedMilliseconds:F1} ms. TraceId: {TraceId}",
                context.Request.Method,
                context.Request.Path.Value,
                Stopwatch.GetElapsedTime(startedAt).TotalMilliseconds,
                traceId);

            throw;
        }
    }
}
