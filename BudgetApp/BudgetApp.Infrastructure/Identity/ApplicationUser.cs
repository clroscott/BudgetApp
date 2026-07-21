using Microsoft.AspNetCore.Identity;

namespace BudgetApp.Infrastructure.Identity;

public sealed class ApplicationUser : IdentityUser<Guid>
{
    public required string DisplayName { get; set; }
}
