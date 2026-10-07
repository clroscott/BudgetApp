using System.Data;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using BudgetApp.Application.Authentication;
using BudgetApp.Application.Email;
using BudgetApp.Infrastructure.Data;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Infrastructure.Identity;

/// <summary>Durable single-use challenges and recovery codes, using the existing Identity token table.
/// All consumption/counters are serialized with the user row, including across server processes.</summary>
public sealed class LoginVerificationService(
    BudgetAppDbContext db, UserManager<ApplicationUser> users, EmailTemplateFactory templates,
    EmailDispatchService email, IDataProtectionProvider protection, TimeProvider clock)
{
    public static readonly TimeSpan CodeLifetime = TimeSpan.FromMinutes(5);
    public static readonly TimeSpan ChallengeLifetime = TimeSpan.FromMinutes(10);
    public static readonly TimeSpan Cooldown = TimeSpan.FromMinutes(1);
    public static readonly TimeSpan AttemptWindow = TimeSpan.FromMinutes(15);
    public const int AttemptLimit = 5;
    private const string Provider = "BudgetApp.LoginVerification";
    private const string Recovery = "SavedRecoveryCodes";
    private const string Limits = "Limits";
    private readonly IDataProtector protector = protection.CreateProtector("BudgetApp.LoginVerification.Code.v1");

    public async Task<LoginVerificationStatus> StatusAsync(ApplicationUser user, CancellationToken ct) =>
        new(user.TwoFactorEnabled, Read<string[]>(
            (await TokenAsync(user.Id, Recovery, ct))?.Value)?.Length ?? 0);

    public async Task<VerificationChallenge> BeginAsync(Guid userId, VerificationPurpose purpose,
        string expectedStamp, CancellationToken ct)
    {
        Challenge state;
        string code;
        string address;
        await using (var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct))
        {
            var user = await LockUserAsync(userId, ct);
            if (user is null || user.SecurityStamp != expectedStamp || !user.EmailConfirmed ||
                (purpose == VerificationPurpose.Enable ? user.TwoFactorEnabled : !user.TwoFactorEnabled) ||
                await users.IsLockedOutAsync(user)) throw Unavailable();
            var now = clock.GetUtcNow();
            var limits = await GetLimits(userId, ct);
            CheckLimits(limits, now, sending: true);
            code = NewCode(Read<Challenge>((await TokenAsync(userId, purpose.ToString(), ct))?.Value)?.ProtectedCode);
            address = user.Email!;
            state = new(Guid.NewGuid(), user.NormalizedEmail!, user.SecurityStamp!, now,
                now + CodeLifetime, now + ChallengeLifetime, protector.Protect(code), false);
            await StoreAsync(userId, purpose.ToString(), state, ct);
            await StoreAsync(userId, Limits, limits with { LastSentAt = now }, ct);
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        return await Deliver(userId, purpose, state, address, code, ct);
    }

    public async Task<VerificationChallenge?> PendingAsync(Guid userId, Guid challengeId,
        VerificationPurpose purpose, CancellationToken ct)
    {
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == userId, ct);
        var token = await db.UserTokens.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId &&
            x.LoginProvider == Provider && x.Name == purpose.ToString(), ct);
        var state = Read<Challenge>(token?.Value);
        return Valid(user, state, challengeId, purpose) && !await users.IsLockedOutAsync(user!) ? Response(state!) : null;
    }

    public async Task<VerificationChallenge> ResendAsync(Guid userId, Guid challengeId,
        VerificationPurpose purpose, CancellationToken ct)
    {
        Challenge state;
        string address;
        string code;
        await using (var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct))
        {
            var user = await LockUserAsync(userId, ct);
            var token = await TokenAsync(userId, purpose.ToString(), ct);
            var previous = Read<Challenge>(token?.Value);
            if (!Valid(user, previous, challengeId, purpose) || await users.IsLockedOutAsync(user!)) throw Unavailable();
            var now = clock.GetUtcNow();
            var limits = await GetLimits(userId, ct);
            CheckLimits(limits, now, sending: true);
            code = NewCode(previous!.ProtectedCode);
            address = user!.Email!;
            state = previous! with { SentAt = now, CodeExpiresAt = Min(now + CodeLifetime, previous!.ExpiresAt),
                ProtectedCode = protector.Protect(code), Delivered = false };
            token!.Value = JsonSerializer.Serialize(state);
            await StoreAsync(userId, Limits, limits with { LastSentAt = now }, ct);
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        return await Deliver(userId, purpose, state, address, code, ct);
    }

    private async Task<VerificationChallenge> Deliver(Guid userId, VerificationPurpose purpose,
        Challenge state, string address, string code, CancellationToken ct)
    {
        var result = await email.SendAsync(templates.CreateLoginVerification(address, code,
            state.CodeExpiresAt, purpose.ToString()), ct);
        // Never hold a database lock during SMTP. A late result must not revive a consumed/replaced code.
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await LockUserAsync(userId, ct);
        var token = await TokenAsync(userId, purpose.ToString(), ct);
        var current = Read<Challenge>(token?.Value);
        if (current?.Id == state.Id && current.ProtectedCode == state.ProtectedCode)
        {
            token!.Value = JsonSerializer.Serialize(current with { Delivered = result.Succeeded });
            await db.SaveChangesAsync(ct);
        }
        await tx.CommitAsync(ct);
        return Response(state with { Delivered = result.Succeeded });
    }

    public async Task<ApplicationUser> CompleteLoginAsync(Guid userId, VerificationProof proof, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        var user = await LockUserAsync(userId, ct) ?? throw Unavailable();
        if (!await ConsumeLockedAsync(user, VerificationPurpose.Login, proof, ct))
        {
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct); // Persist failed attempt counters, not just successful consumption.
            throw Unavailable();
        }
        Ensure(await users.ResetAccessFailedCountAsync(user));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return user;
    }

    public async Task CancelLoginAsync(Guid userId, Guid challengeId, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await LockUserAsync(userId, ct);
        var token = await TokenAsync(userId, VerificationPurpose.Login.ToString(), ct);
        if (Read<Challenge>(token?.Value)?.Id == challengeId) db.UserTokens.Remove(token!);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    public async Task<(ApplicationUser User, string[]? Codes)> ManageAsync(Guid userId,
        VerificationPurpose purpose, string password, VerificationProof proof, string? newPassword, CancellationToken ct)
    {
        if (purpose is not (VerificationPurpose.Enable or VerificationPurpose.Disable or
            VerificationPurpose.RecoveryCodes or VerificationPurpose.ChangePassword)) throw Unavailable();
        ApplicationUser user;
        string[]? codes = null;
        await using (var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct))
        {
            user = await LockUserAsync(userId, ct) ?? throw Unavailable();
            if (!await users.CheckPasswordAsync(user, password) || await users.IsLockedOutAsync(user)) throw Unavailable();
            if (!await ConsumeLockedAsync(user, purpose, proof, ct))
            {
                await db.SaveChangesAsync(ct);
                await tx.CommitAsync(ct);
                throw Unavailable();
            }
            if (purpose == VerificationPurpose.ChangePassword)
                Ensure(await users.ChangePasswordAsync(user, password, newPassword!));
            else
            {
                if (purpose == VerificationPurpose.Enable) user.TwoFactorEnabled = true;
                if (purpose == VerificationPurpose.Disable) user.TwoFactorEnabled = false;
                if (purpose is VerificationPurpose.Enable or VerificationPurpose.RecoveryCodes)
                {
                    codes = Enumerable.Range(0, 10).Select(_ =>
                        string.Join('-', Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).Chunk(8)
                            .Select(chars => new string(chars)))).ToArray();
                    await StoreAsync(userId, Recovery, codes.Select(HashRecovery).ToArray(), ct);
                }
                else
                {
                    var recovery = await TokenAsync(userId, Recovery, ct);
                    if (recovery is not null) db.UserTokens.Remove(recovery);
                }
                Ensure(await users.UpdateSecurityStampAsync(user));
            }
            await RemoveChallengesAsync(userId, ct);
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        }
        if (purpose != VerificationPurpose.ChangePassword)
            await email.SendAsync(templates.CreateLoginVerificationChanged(user.Email!, purpose.ToString()), ct);
        return (user, codes);
    }

    /// <summary>Caller holds the user row lock and commits failures as well as successful consumption.
    /// Used by email replacement so authorization and the request write share one transaction.</summary>
    public async Task<bool> ConsumeLockedAsync(ApplicationUser user, VerificationPurpose purpose,
        VerificationProof? proof, CancellationToken ct)
    {
        if (proof is null || string.IsNullOrWhiteSpace(proof.Code) || proof.Code.Length > 100 || await users.IsLockedOutAsync(user)) return false;
        var token = await TokenAsync(user.Id, purpose.ToString(), ct);
        var state = Read<Challenge>(token?.Value);
        if (!Valid(user, state, proof.ChallengeId, purpose)) return false;
        var now = clock.GetUtcNow();
        var limits = await GetLimits(user.Id, ct);
        CheckLimits(limits, now, sending: false);
        var correct = false;
        if (proof.UseRecoveryCode && purpose != VerificationPurpose.Enable)
        {
            var recovery = await TokenAsync(user.Id, Recovery, ct);
            var hashes = Read<string[]>(recovery?.Value) ?? [];
            var hash = HashRecovery(proof.Code);
            correct = hashes.Any(item => FixedEquals(item, hash));
            if (correct) recovery!.Value = JsonSerializer.Serialize(hashes.Where(item => !FixedEquals(item, hash)).ToArray());
        }
        else if (!proof.UseRecoveryCode && state!.Delivered && now < state.CodeExpiresAt)
        {
            try { correct = FixedEquals(protector.Unprotect(state.ProtectedCode), proof.Code.Trim()); }
            catch (CryptographicException) { /* Lost key ring: fail closed, recovery codes remain usable. */ }
        }
        if (correct)
        {
            db.UserTokens.Remove(token!);
            await StoreAsync(user.Id, Limits, limits with { Failures = 0, WindowStartedAt = now }, ct);
            return true;
        }
        limits = limits with { Failures = limits.Failures + 1 };
        await StoreAsync(user.Id, Limits, limits, ct);
        if (limits.Failures >= AttemptLimit)
        {
            Ensure(await users.SetLockoutEndDateAsync(user, now + AttemptWindow));
            await RemoveChallengesAsync(user.Id, ct);
        }
        return false;
    }

    private bool Valid(ApplicationUser? user, Challenge? state, Guid id, VerificationPurpose purpose) =>
        user is not null && state is not null && id != Guid.Empty && state.Id == id && user.EmailConfirmed &&
        state.Email == user.NormalizedEmail && state.Stamp == user.SecurityStamp && clock.GetUtcNow() < state.ExpiresAt &&
        (purpose == VerificationPurpose.Enable ? !user.TwoFactorEnabled : user.TwoFactorEnabled);

    private async Task<AttemptLimits> GetLimits(Guid id, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var previous = Read<AttemptLimits>((await TokenAsync(id, Limits, ct))?.Value);
        return previous is null ? new(0, now, null) : now >= previous.WindowStartedAt + AttemptWindow
            ? previous with { Failures = 0, WindowStartedAt = now } : previous;
    }
    private static void CheckLimits(AttemptLimits limits, DateTimeOffset now, bool sending)
    {
        if (limits.Failures >= AttemptLimit) throw new VerificationException("Too many verification attempts. Wait 15 minutes and sign in again.", true);
        if (sending && limits.LastSentAt is { } last && now < last + Cooldown)
            throw new VerificationException("Wait at least one minute before requesting another verification email. Resending does not reset attempt limits.", true);
    }
    private async Task RemoveChallengesAsync(Guid id, CancellationToken ct)
    {
        var names = Enum.GetNames<VerificationPurpose>();
        db.UserTokens.RemoveRange(await db.UserTokens.Where(x => x.UserId == id &&
            x.LoginProvider == Provider && names.Contains(x.Name)).ToListAsync(ct));
    }
    private async Task StoreAsync<T>(Guid id, string name, T value, CancellationToken ct)
    {
        var token = await TokenAsync(id, name, ct);
        if (token is null) db.UserTokens.Add(token = new() { UserId = id, LoginProvider = Provider, Name = name });
        token.Value = JsonSerializer.Serialize(value);
    }
    private Task<IdentityUserToken<Guid>?> TokenAsync(Guid id, string name, CancellationToken ct) =>
        db.UserTokens.SingleOrDefaultAsync(x => x.UserId == id && x.LoginProvider == Provider && x.Name == name, ct);
    private async Task<ApplicationUser?> LockUserAsync(Guid id, CancellationToken ct)
    {
        var user = db.Database.IsSqlServer()
            ? await db.Users.FromSqlInterpolated($"SELECT * FROM [AspNetUsers] WITH (UPDLOCK, HOLDLOCK) WHERE [Id] = {id}").SingleOrDefaultAsync(ct)
            : await db.Users.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (user is not null) await db.Entry(user).ReloadAsync(ct);
        return user;
    }
    private string NewCode(string? previousProtectedCode = null)
    {
        string? previous = null;
        if (previousProtectedCode is not null)
        {
            try { previous = protector.Unprotect(previousProtectedCode); }
            catch (CryptographicException) { /* An unreadable old code cannot authenticate. */ }
        }
        string code;
        do { code = RandomNumberGenerator.GetInt32(1_000_000).ToString("D6", CultureInfo.InvariantCulture); }
        while (code == previous); // Resending must not accidentally repeat the replaced code.
        return code;
    }
    private static string HashRecovery(string code) => Convert.ToHexString(SHA256.HashData(
        Encoding.UTF8.GetBytes(code.Replace("-", "", StringComparison.Ordinal).Replace(" ", "", StringComparison.Ordinal).Trim().ToUpperInvariant())));
    private static bool FixedEquals(string left, string right) => CryptographicOperations.FixedTimeEquals(
        Encoding.UTF8.GetBytes(left), Encoding.UTF8.GetBytes(right));
    private static T? Read<T>(string? value)
    {
        try { return value is null ? default : JsonSerializer.Deserialize<T>(value); }
        catch (JsonException) { return default; }
    }
    private static DateTimeOffset Min(DateTimeOffset a, DateTimeOffset b) => a < b ? a : b;
    private static VerificationChallenge Response(Challenge state) => new(state.Id, state.CodeExpiresAt,
        state.SentAt + Cooldown, state.ExpiresAt, state.Delivered);
    private static VerificationException Unavailable() => new("Verification could not be completed. Check your password and code. Codes may be expired, replaced, already used, or belong to another action. Retry or start again; recovery codes are also available.");
    private static void Ensure(IdentityResult result)
    {
        if (!result.Succeeded) throw new VerificationException("The security change was not saved. Check the values and request fresh verification before retrying.");
    }
    private sealed record Challenge(Guid Id, string Email, string Stamp, DateTimeOffset SentAt,
        DateTimeOffset CodeExpiresAt, DateTimeOffset ExpiresAt, string ProtectedCode, bool Delivered);
    private sealed record AttemptLimits(int Failures, DateTimeOffset WindowStartedAt, DateTimeOffset? LastSentAt);
}

public sealed class VerificationException(string message, bool rateLimited = false) : Exception(message)
{
    public bool RateLimited { get; } = rateLimited;
}
