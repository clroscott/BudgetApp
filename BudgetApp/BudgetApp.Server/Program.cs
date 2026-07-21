using BudgetApp.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();
builder.Services.AddInfrastructure(
    builder.Configuration.GetConnectionString("BudgetApp")
        ?? throw new InvalidOperationException(
            "Connection string 'BudgetApp' is not configured."));

var app = builder.Build();

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
