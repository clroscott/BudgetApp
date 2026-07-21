using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Infrastructure.Data;

public sealed class BudgetAppDbContext(DbContextOptions<BudgetAppDbContext> options)
    : DbContext(options);
