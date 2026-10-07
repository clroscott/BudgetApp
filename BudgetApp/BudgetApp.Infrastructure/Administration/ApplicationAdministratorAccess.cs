using BudgetApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Infrastructure.Administration;

// Database grants are the only authority; never household roles or browser claims.
public sealed class ApplicationAdministratorAccess(BudgetAppDbContext db)
{
    public Task<bool> IsDesignatedAsync(Guid userId, CancellationToken ct = default) =>
        db.ApplicationAdministratorGrants.AsNoTracking().AnyAsync(x => x.UserId == userId, ct);
    public Task<bool> IsOwnerAsync(Guid userId, CancellationToken ct = default) =>
        db.ApplicationAdministratorGrants.AsNoTracking().AnyAsync(x => x.UserId == userId && x.Role == ApplicationAdministratorRole.InstallationOwner, ct);

    // All privilege changes (including last-owner MFA disabling) acquire this
    // installation-wide gate before user locks, so concurrent removals serialize.
    internal async Task<ApplicationAdministrationState> LockStateAsync(CancellationToken ct)
    {
        var state = db.Database.IsSqlServer() ? await db.ApplicationAdministrationStates
            .FromSqlRaw("SELECT * FROM [ApplicationAdministrationState] WITH (UPDLOCK, HOLDLOCK) WHERE [Id] = 1").SingleAsync(ct) :
            await db.ApplicationAdministrationStates.SingleAsync(x => x.Id == 1, ct);
        await db.Entry(state).ReloadAsync(ct);
        return state;
    }
    internal async Task EnsureOtherEligibleOwnerAsync(Guid excludingId, DateTimeOffset now, CancellationToken ct)
    {
        // SQLite's test provider cannot compare DateTimeOffset in SQL. Project
        // only eligible-owner lockout timestamps, then compare them portably.
        var lockouts = await db.ApplicationAdministratorGrants.AsNoTracking().Join(db.Users.AsNoTracking(), grant => grant.UserId, user => user.Id, (grant, user) => new { grant, user })
            .Where(x => x.grant.Role == ApplicationAdministratorRole.InstallationOwner && x.user.Id != excludingId && x.user.EmailConfirmed && x.user.TwoFactorEnabled)
            .Select(x => x.user.LockoutEnd).ToListAsync(ct);
        if (!lockouts.Any(lockout => lockout is null || lockout <= now))
            throw new AdministrationException(409, "Keep at least one other installation owner with verified email, enabled MFA and available sign-in before removing this owner or disabling their MFA.");
    }
}
