using System.Data;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using BudgetApp.Application.Authentication;
using BudgetApp.Application.Email;
using BudgetApp.Infrastructure.Data;
using BudgetApp.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Infrastructure.Administration;

public sealed class ApplicationAdministrationService(BudgetAppDbContext db, UserManager<ApplicationUser> users,
    LoginVerificationService verification, ApplicationAdministratorAccess access, EmailTemplateFactory templates,
    EmailDispatchService email, TimeProvider clock)
{
    public const string PasswordReset = "PasswordResetEmail";
    public const string MfaRecovery = "MfaRecoveryEmail";
    public const string RevokeSessions = "RevokeSessions";
    public const string GrantOwner = "GrantOwnerAccess";
    public const string GrantSupport = "GrantSupportAccess";
    public const string RemoveAdministrator = "RemoveAdministratorAccess";
    public static bool IsGrantAction(string action) => action is GrantOwner or GrantSupport or RemoveAdministrator;
    public static readonly TimeSpan RecoveryLifetime = TimeSpan.FromMinutes(15);
    private const string RecoveryProvider = "BudgetApp.OperatorRecovery";
    private const string RecoveryName = "EmailMfa";

    public async Task<IReadOnlyList<AdministrativeAccount>> SearchAsync(string? search, CancellationToken ct)
    {
        search = search?.Trim();
        if (string.IsNullOrEmpty(search)) return [];
        if (search.Length is < 3 or > 256) throw new AdministrationException(400, "Enter at least three characters (maximum 256).");
        var normalized = users.NormalizeEmail(search)!;
        var matches = await db.Users.AsNoTracking().Where(x => x.NormalizedEmail!.Contains(normalized) || x.DisplayName.Contains(search))
            .OrderBy(x => x.NormalizedEmail).ThenBy(x => x.Id).Take(25).ToListAsync(ct);
        var ids = matches.Select(x => x.Id).ToArray();
        var grants = await db.ApplicationAdministratorGrants.AsNoTracking().Where(x => ids.Contains(x.UserId)).ToDictionaryAsync(x => x.UserId, ct);
        return matches.Select(user => Account(user, grants.GetValueOrDefault(user.Id))).ToArray();
    }
    public async Task<AdministrativeAccount> GetAccountAsync(Guid id, CancellationToken ct)
    {
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new AdministrationException(404, "Account not found.");
        return Account(user, await db.ApplicationAdministratorGrants.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == id, ct));
    }
    public async Task<(IReadOnlyList<AdministrativeAccount> Items, int TotalCount)> UsersAsync(string? search, int page, CancellationToken ct)
    {
        if (page is < 1 or > 10000) throw new AdministrationException(400, "Invalid user page.");
        search = search?.Trim();
        if (search?.Length > 256) throw new AdministrationException(400, "Use at most 256 characters to filter users.");
        var query = db.Users.AsNoTracking();
        if (!string.IsNullOrEmpty(search))
        {
            var normalized = users.NormalizeEmail(search)!;
            query = query.Where(x => x.NormalizedEmail!.Contains(normalized) || x.DisplayName.ToUpper().Contains(normalized));
        }
        var count = await query.CountAsync(ct);
        var matches = await query.OrderBy(x => x.NormalizedEmail).ThenBy(x => x.Id).Skip((page - 1) * 20).Take(20).ToListAsync(ct);
        var ids = matches.Select(x => x.Id).ToArray();
        var grants = await db.ApplicationAdministratorGrants.AsNoTracking().Where(x => ids.Contains(x.UserId)).ToDictionaryAsync(x => x.UserId, ct);
        return (matches.Select(user => Account(user, grants.GetValueOrDefault(user.Id))).ToArray(), count);
    }
    public async Task<(IReadOnlyList<AdministrativeAccount> Items, int TotalCount)> AdministratorsAsync(int page, CancellationToken ct)
    {
        if (page is < 1 or > 10000) throw new AdministrationException(400, "Invalid administrator page.");
        var query = db.ApplicationAdministratorGrants.AsNoTracking().Join(db.Users.AsNoTracking(), grant => grant.UserId, user => user.Id, (grant, user) => new { grant, user });
        var count = await query.CountAsync(ct);
        var entries = await query.OrderBy(x => x.user.NormalizedEmail).ThenBy(x => x.user.Id).Skip((page - 1) * 20).Take(20).ToListAsync(ct);
        return (entries.Select(x => Account(x.user, x.grant)).ToArray(), count);
    }
    private AdministrativeAccount Account(ApplicationUser user, ApplicationAdministratorGrant? grant) => new(user.Id, user.DisplayName, user.Email!,
        user.EmailConfirmed, user.TwoFactorEnabled, user.LockoutEnd > clock.GetUtcNow() ? user.LockoutEnd : null,
        user.ConcurrencyStamp!, grant is not null, grant?.Role.ToString(), grant?.Version);

    public async Task<(IReadOnlyList<AdministrativeAuditItem> Items, int TotalCount)> AuditAsync(Guid? target, int page, CancellationToken ct)
    {
        if (page is < 1 or > 10000) throw new AdministrationException(400, "Invalid audit page.");
        var query = db.AdministrativeAuditEvents.AsNoTracking();
        if (target is not null) query = query.Where(x => x.TargetUserId == target);
        var count = await query.CountAsync(ct);
        var items = await query.OrderByDescending(x => x.OccurredAtUtc).ThenByDescending(x => x.Id)
            .Skip((page - 1) * 20).Take(20).Select(x => new AdministrativeAuditItem(x.Id, x.ActorUserId,
                x.TargetUserId, x.Action, x.Reason, x.Outcome, x.OccurredAtUtc)).ToListAsync(ct);
        return (items, count);
    }
    public async Task<VerificationChallenge> PrepareAsync(ApplicationUser actor, AdministrativeActionRequest request, CancellationToken ct)
    {
        Validate(request);
        var target = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == request.TargetUserId, ct);
        await RequireTargetAsync(actor.Id, target, request, ct);
        if (await db.AdministrativeAuditEvents.AnyAsync(x => x.Id == request.OperationId, ct))
            throw new AdministrationException(409, "This operation has already been attempted. Check its result before starting another action.");
        return await verification.BeginAsync(actor.Id, VerificationPurpose.Administration, actor.SecurityStamp!, ct, Context(request));
    }
    public async Task<VerificationChallenge> ResendAsync(Guid actorId, AdministrativeActionRequest request, Guid challengeId, CancellationToken ct)
    {
        Validate(request);
        if (IsGrantAction(request.Action) && !await access.IsOwnerAsync(actorId, ct)) throw new AdministrationException(403, "Only installation owners can manage administrator access.");
        return await verification.ResendAsync(actorId, challengeId, VerificationPurpose.Administration, ct, Context(request));
    }

    public async Task<AdministrativeActionResult> ExecuteAsync(Guid actorId, string expectedActorStamp,
        AdministrativeActionRequest request, VerificationProof proof, CancellationToken ct)
    {
        Validate(request);
        var context = Context(request);
        EmailMessage? message = null;
        AdministrativeAuditEvent audit;
        await using (var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct))
        {
            await access.LockStateAsync(ct);
            // Lock both users in a stable order, avoiding opposite-operator deadlocks.
            var locked = new Dictionary<Guid, ApplicationUser?>();
            foreach (var id in new[] { actorId, request.TargetUserId }.Distinct().Order()) locked[id] = await LockUserAsync(id, ct);
            var actor = locked[actorId]; var target = locked[request.TargetUserId];
            if (actor is null || !await access.IsDesignatedAsync(actor.Id, ct) || !actor.EmailConfirmed || !actor.TwoFactorEnabled ||
                actor.SecurityStamp != expectedActorStamp || await users.IsLockedOutAsync(actor)) throw new AdministrationException(403, "Application-admin access is unavailable.");
            var existing = await db.AdministrativeAuditEvents.SingleOrDefaultAsync(x => x.Id == request.OperationId, ct);
            if (existing is not null)
            {
                if (existing.ActorUserId != actorId || existing.ContextHash != context) throw new AdministrationException(409, "Operation details do not match the recorded action.");
                return Result(existing); // A repeated/lost-response request never repeats a write or an email.
            }
            audit = new() { Id = request.OperationId, ActorUserId = actorId, TargetUserId = request.TargetUserId,
                Action = request.Action, Reason = request.Reason.Trim(), ContextHash = context,
                Outcome = "VerificationFailed", OccurredAtUtc = clock.GetUtcNow() };
            try { target = await RequireTargetAsync(actorId, target, request, ct); }
            catch (AdministrationException error)
            {
                audit.Outcome = error.Status == 409 ? "Conflict" : "Rejected";
                db.AdministrativeAuditEvents.Add(audit); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); throw;
            }
            if (!await users.CheckPasswordAsync(actor, request.CurrentPassword)) throw new AdministrationException(400, "Check your current password.");
            if (!await verification.ConsumeLockedAsync(actor, VerificationPurpose.Administration, proof, ct, context))
            {
                db.AdministrativeAuditEvents.Add(audit);
                await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
                throw new AdministrationException(400, "The action was not performed. Check your MFA code and start a new action.");
            }
            if (request.Action is PasswordReset or MfaRecovery && await db.AdministrativeAuditEvents.AnyAsync(x =>
                x.TargetUserId == target!.Id && x.Action == request.Action && x.Outcome != "VerificationFailed" && x.Outcome != "Rejected" && x.Outcome != "Conflict" &&
                x.OccurredAtUtc > clock.GetUtcNow() - TimeSpan.FromMinutes(1), ct))
            {
                audit.Outcome = "RateLimited"; db.AdministrativeAuditEvents.Add(audit);
                await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
                throw new AdministrationException(429, "Wait at least one minute before requesting another email for this account.");
            }
            if (IsGrantAction(request.Action))
            {
                var grant = await db.ApplicationAdministratorGrants.SingleOrDefaultAsync(x => x.UserId == target!.Id, ct);
                if (request.Action == RemoveAdministrator) db.ApplicationAdministratorGrants.Remove(grant!);
                else
                {
                    if (grant is null) db.ApplicationAdministratorGrants.Add(grant = new() { UserId = target.Id });
                    grant.Role = request.Action == GrantOwner ? ApplicationAdministratorRole.InstallationOwner : ApplicationAdministratorRole.SupportAdministrator;
                    grant.Version = Guid.NewGuid().ToString("N");
                }
                Ensure(await users.UpdateSecurityStampAsync(target));
                audit.Outcome = "Succeeded";
                message = templates.CreateAdministrativeSecurityNotice(target.Email!, request.Action == RemoveAdministrator ?
                    "Your application-administrator access was removed. Your normal account, households and financial data are unchanged. Sign in again." :
                    $"Your application access is now {(request.Action == GrantOwner ? "Installation owner" : "Support administrator")}. This is separate from household permissions. Sign in again with MFA.");
            }
            else if (request.Action == RevokeSessions)
            {
                Ensure(await users.UpdateSecurityStampAsync(target!));
                await RemoveRecoveryAsync(target!.Id, ct);
                audit.Outcome = "Succeeded";
                message = templates.CreateAdministrativeSecurityNotice(target.Email!, "An application administrator revoked your sign-in sessions. Sign in again to continue.");
            }
            else if (request.Action == PasswordReset)
            {
                var token = await users.GeneratePasswordResetTokenAsync(target!);
                message = templates.CreatePasswordRecovery(target.Email!, target.Id, token, clock.GetUtcNow() + PasswordRecoveryService.TokenLifespan);
                audit.Outcome = "PendingDelivery";
            }
            else
            {
                var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
                var state = new RecoveryState(request.OperationId, actor.Id, actor.SecurityStamp!, target!.NormalizedEmail!,
                    target.SecurityStamp!, Hash(token), clock.GetUtcNow() + RecoveryLifetime, false);
                var stored = await RecoveryTokenAsync(target.Id, ct);
                if (stored is null) db.UserTokens.Add(stored = new() { UserId = target.Id, LoginProvider = RecoveryProvider, Name = RecoveryName });
                stored.Value = JsonSerializer.Serialize(state);
                message = templates.CreateOperatorMfaRecovery(target.Email!, target.Id, token, state.ExpiresAt);
                audit.Outcome = "PendingDelivery";
            }
            db.AdministrativeAuditEvents.Add(audit);
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        }
        // External SMTP runs only after the operation ledger is committed. A lost
        // response remains PendingDelivery; callers must read, never blindly replay.
        var delivered = await email.SendAsync(message!, ct);
        await using (var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct))
        {
            await LockUserAsync(request.TargetUserId, ct);
            await db.Entry(audit).ReloadAsync(ct);
            if (request.Action == MfaRecovery)
            {
                var stored = await RecoveryTokenAsync(request.TargetUserId, ct);
                var current = ReadRecovery(stored?.Value);
                if (current?.OperationId == request.OperationId)
                    stored!.Value = JsonSerializer.Serialize(current with { Delivered = delivered.Succeeded });
            }
            audit.Outcome = request.Action == RevokeSessions || IsGrantAction(request.Action) ? (delivered.Succeeded ? "Succeeded" : "SucceededNoticeFailed") :
                delivered.Succeeded ? "EmailSent" : "DeliveryFailed";
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        }
        return Result(audit);
    }

    // This is not an admin-authenticated bypass: the recipient must prove control
    // of the unchanged registered mailbox AND know the current password.
    public async Task<string[]> CompleteMfaRecoveryAsync(Guid userId, string token, string password, CancellationToken ct)
    {
        var initial = ReadRecovery((await db.UserTokens.AsNoTracking().SingleOrDefaultAsync(x =>
            x.UserId == userId && x.LoginProvider == RecoveryProvider && x.Name == RecoveryName, ct))?.Value);
        if (initial is null) throw RecoveryUnavailable();
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await access.LockStateAsync(ct);
        var locked = new Dictionary<Guid, ApplicationUser?>();
        foreach (var id in new[] { userId, initial.ActorId }.Distinct().Order()) locked[id] = await LockUserAsync(id, ct);
        var user = locked[userId]; var actor = locked[initial.ActorId];
        var stored = await RecoveryTokenAsync(userId, ct); var state = ReadRecovery(stored?.Value);
        if (state is null || state.ActorId != initial.ActorId || user is null || actor is null || !await access.IsDesignatedAsync(actor.Id, ct) ||
            !actor.EmailConfirmed || !actor.TwoFactorEnabled || await users.IsLockedOutAsync(actor) ||
            actor.SecurityStamp != state.ActorStamp || !user.EmailConfirmed || !user.TwoFactorEnabled ||
            await access.IsDesignatedAsync(user.Id, ct) || user.SecurityStamp != state.TargetStamp || user.NormalizedEmail != state.Email ||
            !state.Delivered || clock.GetUtcNow() >= state.ExpiresAt || token.Length > 100 ||
            !CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(state.TokenHash), Encoding.ASCII.GetBytes(Hash(token)))) throw RecoveryUnavailable();
        if (await users.IsLockedOutAsync(user)) throw RecoveryUnavailable();
        if (!await users.CheckPasswordAsync(user, password))
        {
            Ensure(await users.AccessFailedAsync(user));
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); throw RecoveryUnavailable();
        }
        var codes = await verification.RenewEmailMfaLockedAsync(user, ct);
        Ensure(await users.ResetAccessFailedCountAsync(user));
        db.UserTokens.Remove(stored!);
        db.AdministrativeAuditEvents.Add(new() { Id = Guid.NewGuid(), ActorUserId = actor.Id, TargetUserId = user.Id,
            Action = "MfaRecoveryCompleted", Reason = "User confirmed the recovery email and current password.",
            Outcome = "Succeeded", ContextHash = "", OccurredAtUtc = clock.GetUtcNow() });
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        await email.SendAsync(templates.CreateAdministrativeSecurityNotice(user.Email!, "Your email MFA was reset. Old recovery codes and sessions no longer work. MFA remains on. If you did not do this, contact the person who manages this installation."), ct);
        return codes;
    }
    private async Task<ApplicationUser> RequireTargetAsync(Guid actorId, ApplicationUser? target, AdministrativeActionRequest request, CancellationToken ct)
    {
        if (target is null) throw new AdministrationException(404, "Account not found.");
        if (IsGrantAction(request.Action))
        {
            if (!await access.IsOwnerAsync(actorId, ct)) throw new AdministrationException(403, "Only installation owners can manage application-administrator access.");
            var grant = await db.ApplicationAdministratorGrants.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == target.Id, ct);
            if (grant?.Version != request.GrantVersion) throw new AdministrationException(409, "Administrator access changed. Refresh and review it again.");
            if (request.Action == RemoveAdministrator && grant is null) throw new AdministrationException(400, "This account has no administrator access to remove.");
            if (request.Action != RemoveAdministrator)
            {
                if (!target.EmailConfirmed || !target.TwoFactorEnabled || await users.IsLockedOutAsync(target))
                    throw new AdministrationException(400, "The account needs verified email, enabled MFA and available sign-in before receiving administrator access.");
                var desired = request.Action == GrantOwner ? ApplicationAdministratorRole.InstallationOwner : ApplicationAdministratorRole.SupportAdministrator;
                if (grant?.Role == desired) throw new AdministrationException(400, "This account already has that administrator role.");
            }
            if (grant?.Role == ApplicationAdministratorRole.InstallationOwner && request.Action != GrantOwner)
                await access.EnsureOtherEligibleOwnerAsync(target.Id, clock.GetUtcNow(), ct);
        }
        else if (target.Id == actorId || await access.IsDesignatedAsync(target.Id, ct))
            throw new AdministrationException(403, "These support tools cannot change application-administrator accounts. Use personal account settings or a separately reviewed recovery process.");
        if (target.ConcurrencyStamp != request.Version) throw new AdministrationException(409, "The account changed. Refresh its status and review the action again.");
        if (request.Action is PasswordReset or MfaRecovery && !target.EmailConfirmed) throw new AdministrationException(400, "The account must have a verified email for this recovery action.");
        if (request.Action == MfaRecovery && !target.TwoFactorEnabled) throw new AdministrationException(400, "MFA is not enabled on this account.");
        return target;
    }
    private static void Validate(AdministrativeActionRequest request)
    {
        if (request.OperationId == Guid.Empty || request.TargetUserId == Guid.Empty ||
            request.Action is not (PasswordReset or MfaRecovery or RevokeSessions or GrantOwner or GrantSupport or RemoveAdministrator) ||
            request.Reason.Trim().Length is < 5 or > 500) throw new AdministrationException(400, "Choose a supported action and give a reason (5–500 characters).");
    }
    private static string Context(AdministrativeActionRequest r) => Hash(JsonSerializer.Serialize(new { r.OperationId, r.TargetUserId, r.Action, Reason = r.Reason.Trim(), r.Version, r.GrantVersion }));
    private static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
    private Task<IdentityUserToken<Guid>?> RecoveryTokenAsync(Guid id, CancellationToken ct) =>
        db.UserTokens.SingleOrDefaultAsync(x => x.UserId == id && x.LoginProvider == RecoveryProvider && x.Name == RecoveryName, ct);
    private async Task RemoveRecoveryAsync(Guid id, CancellationToken ct)
    { var token = await RecoveryTokenAsync(id, ct); if (token is not null) db.UserTokens.Remove(token); }
    private async Task<ApplicationUser?> LockUserAsync(Guid id, CancellationToken ct)
    {
        var user = db.Database.IsSqlServer() ? await db.Users.FromSqlInterpolated($"SELECT * FROM [AspNetUsers] WITH (UPDLOCK, HOLDLOCK) WHERE [Id] = {id}").SingleOrDefaultAsync(ct) :
            await db.Users.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (user is not null) await db.Entry(user).ReloadAsync(ct);
        return user;
    }
    private static RecoveryState? ReadRecovery(string? value)
    { try { return value is null ? null : JsonSerializer.Deserialize<RecoveryState>(value); } catch (JsonException) { return null; } }
    private static AdministrationException RecoveryUnavailable() => new(400, "Recovery could not be completed. The link may be expired, replaced, already used, unavailable, or the password may be incorrect. Contact support to request another link; no MFA bypass is available.");
    private static void Ensure(IdentityResult result)
    { if (!result.Succeeded) throw new AdministrationException(409, "The account changed. Refresh and try again; no automatic retry was performed."); }
    public static AdministrativeActionResult Result(AdministrativeAuditEvent e) => new(e.Id, e.Outcome, e.Outcome switch {
        "EmailSent" => "Email sent to the account's current verified address. The user must complete the recovery steps; no password or MFA setting was changed by sending it.",
        "Succeeded" when e.Action == "MfaRecoveryCompleted" => "The user completed email MFA recovery. Old recovery codes and sessions were replaced; email MFA stays on.",
        "Succeeded" when IsGrantAction(e.Action) || e.Action == "BootstrapOwner" => "Application-administrator access updated and recorded. The affected account must sign in again with MFA. Household permissions and financial data are unchanged.",
        "Succeeded" => "Sessions revoked. Financial data and MFA settings are unchanged.",
        "SucceededNoticeFailed" when IsGrantAction(e.Action) || e.Action == "BootstrapOwner" => "Administrator access updated and recorded, but the notification email failed. Do not repeat the access change; notify the affected person separately.",
        "SucceededNoticeFailed" => "Sessions revoked, but the notification email failed. Financial data and MFA settings are unchanged.",
        "DeliveryFailed" => "Email delivery failed. No password or MFA setting was changed. Check email delivery, then explicitly start a new action after the cooldown.",
        "VerificationFailed" => "Verification failed. No support action was performed. Start a new action to retry.",
        "RateLimited" => "Request rate limited. Wait at least one minute, then explicitly start a new action.",
        "Conflict" => "No action was performed because the account changed. Refresh its status and review a new action.",
        "Rejected" => "The action was rejected. No account changes were made.",
        _ => "The request is recorded, but delivery has not been confirmed. Check its status before starting another action. It will not be sent again automatically."
    });
    private sealed record RecoveryState(Guid OperationId, Guid ActorId, string ActorStamp, string Email,
        string TargetStamp, string TokenHash, DateTimeOffset ExpiresAt, bool Delivered);
}
