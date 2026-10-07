using System.Data;
using BudgetApp.Application.Email;
using BudgetApp.Infrastructure.Data;
using BudgetApp.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Infrastructure.Administration;

// Deliberately registered for local CLI use only. There is no HTTP bootstrap route.
public sealed class ApplicationOwnerBootstrapService(BudgetAppDbContext db, UserManager<ApplicationUser> users,
    ApplicationAdministratorAccess access, EmailTemplateFactory templates, EmailDispatchService email, TimeProvider clock)
{
    public async Task<AdministrativeActionResult> BootstrapAsync(string emailAddress, CancellationToken ct)
    {
        var normalized = users.NormalizeEmail(emailAddress.Trim());
        AdministrativeAuditEvent audit;
        ApplicationUser user;
        await using (var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct))
        {
            var state = await access.LockStateAsync(ct);
            if (state.BootstrapCompleted || await db.ApplicationAdministratorGrants.AnyAsync(ct))
                throw new AdministrationException(409, "Initial owner setup has already been completed. Use the Administrators page; this tool cannot reset or replace an owner.");
            user = await db.Users.SingleOrDefaultAsync(x => x.NormalizedEmail == normalized, ct) ??
                throw new AdministrationException(404, "No existing account matches that email. Register the account, confirm its email and enable MFA first.");
            if (db.Database.IsSqlServer())
                user = await db.Users.FromSqlInterpolated($"SELECT * FROM [AspNetUsers] WITH (UPDLOCK, HOLDLOCK) WHERE [Id] = {user.Id}").SingleAsync(ct);
            await db.Entry(user).ReloadAsync(ct);
            if (!user.EmailConfirmed || !user.TwoFactorEnabled || await users.IsLockedOutAsync(user))
                throw new AdministrationException(400, "The initial owner needs verified email, enabled MFA and available sign-in. Set these up in the normal account interface first.");
            db.ApplicationAdministratorGrants.Add(new() { UserId = user.Id, Role = ApplicationAdministratorRole.InstallationOwner });
            state.BootstrapCompleted = true;
            var updated = await users.UpdateSecurityStampAsync(user);
            if (!updated.Succeeded) throw new AdministrationException(409, "The account changed. No setup was completed; review and retry.");
            audit = new() { Id = Guid.NewGuid(), ActorUserId = user.Id, TargetUserId = user.Id, Action = "BootstrapOwner",
                Reason = "Initial installation owner explicitly selected by email through the server-side setup tool.",
                Outcome = "Succeeded", OccurredAtUtc = clock.GetUtcNow() };
            db.AdministrativeAuditEvents.Add(audit);
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        }
        var sent = await email.SendAsync(templates.CreateAdministrativeSecurityNotice(user.Email!,
            "Your account was explicitly selected as the initial installation owner by the server-side setup tool. Sign in again with MFA. This does not grant financial access to other households."), ct);
        if (!sent.Succeeded) { audit.Outcome = "SucceededNoticeFailed"; await db.SaveChangesAsync(ct); }
        return ApplicationAdministrationService.Result(audit);
    }
}
