using System.Data;
using System.Net.Mail;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using BudgetApp.Application.Authentication;
using BudgetApp.Application.Email;
using BudgetApp.Infrastructure.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace BudgetApp.Infrastructure.Identity;

/// <summary>Identity tokens plus durable, single-use state in the existing Identity token table.</summary>
public sealed class EmailOwnershipService(
    UserManager<ApplicationUser> users,
    BudgetAppDbContext db,
    EmailTemplateFactory templates,
    EmailDispatchService email,
    TimeProvider clock) : IEmailOwnershipService
{
    public static readonly TimeSpan TokenLifespan = TimeSpan.FromHours(1);
    public static readonly TimeSpan ResendCooldown = TimeSpan.FromMinutes(1);
    private const string Provider = "BudgetApp.EmailOwnership";
    private const string Confirmation = "Confirmation";
    private const string EmailChange = "EmailChange";

    public Task RequestConfirmationAsync(Guid userId, CancellationToken cancellationToken = default) =>
        RequestAsync(userId, null, null, cancellationToken);

    public Task<bool> RequestEmailChangeAsync(Guid userId, string newEmail, string currentPassword,
        CancellationToken cancellationToken = default) =>
        RequestAsync(userId, newEmail.Trim(), currentPassword, cancellationToken);

    private async Task<bool> RequestAsync(Guid userId, string? newEmail, string? password,
        CancellationToken ct)
    {
        EmailMessage? message = null;
        await using (var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct))
        {
            var user = await LockUserAsync(userId, ct);
            if (user is null) return false;
            var changing = newEmail is not null;
            if (changing && (!ValidEmail(newEmail!) || !await users.CheckPasswordAsync(user, password!)))
                return false;
            if (!changing && user.EmailConfirmed) return true;

            var name = changing ? EmailChange : Confirmation;
            var stored = await GetStateAsync(userId, name, ct);
            var previous = ReadState(stored?.Value);
            var now = clock.GetUtcNow();
            if (previous is not null && now < previous.RequestedAt + ResendCooldown) return true;

            var available = !changing ||
                (users.NormalizeEmail(newEmail) != user.NormalizedEmail &&
                 await AddressAvailableAsync(userId, newEmail!));
            string? token = null;
            if (available)
                token = changing
                    ? await users.GenerateChangeEmailTokenAsync(user, newEmail!)
                    : await users.GenerateEmailConfirmationTokenAsync(user);

            stored ??= new IdentityUserToken<Guid> { UserId = userId, LoginProvider = Provider, Name = name };
            if (db.Entry(stored).State == EntityState.Detached) db.UserTokens.Add(stored);
            stored.Value = JsonSerializer.Serialize(new OwnershipState(
                user.NormalizedEmail!, newEmail, token is null ? null : Hash(token), now, now + TokenLifespan));
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            if (token is not null)
                message = templates.CreateEmailConfirmation(newEmail ?? user.Email!, userId, token,
                    now + TokenLifespan, changing);
        }

        // A failed delivery must not delete the account or disclose address availability.
        // The committed cooldown still applies; the same explicit resend path remains available.
        if (message is not null) await email.SendAsync(message, ct);
        return true;
    }

    public async Task<bool> ConfirmAsync(Guid callerId, Guid userId, string token, bool changeEmail,
        CancellationToken cancellationToken = default)
    {
        if (callerId != userId || userId == Guid.Empty || string.IsNullOrWhiteSpace(token)) return false;
        await using var transaction = await db.Database.BeginTransactionAsync(
            IsolationLevel.Serializable, cancellationToken);
        var user = await LockUserAsync(userId, cancellationToken);
        var stored = await GetStateAsync(userId, changeEmail ? EmailChange : Confirmation, cancellationToken);
        var state = ReadState(stored?.Value);
        if (user is null || state is null || state.TokenHash is null ||
            state.CurrentEmail != user.NormalizedEmail || clock.GetUtcNow() >= state.ExpiresAt ||
            !CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(state.TokenHash),
                Encoding.ASCII.GetBytes(Hash(token)))) return false;

        try
        {
            IdentityResult result;
            if (changeEmail)
            {
                if (state.NewEmail is null || !await AddressAvailableAsync(userId, state.NewEmail)) return false;
                result = await users.ChangeEmailAsync(user, state.NewEmail, token);
                if (!result.Succeeded) return false;
                result = await users.SetUserNameAsync(user, state.NewEmail);
            }
            else
            {
                result = await users.ConfirmEmailAsync(user, token);
                // Verifying the existing address is not a credential change. Keep
                // signed-in browsers usable; every app request checks the DB flag.
                // Password recovery and changing the address still revoke old sessions.
            }
            if (!result.Succeeded) return false;
            db.UserTokens.Remove(stored!);
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return true;
        }
        catch (DbUpdateException)
        {
            // Includes a concurrent address claim. Email, username, and token consumption roll back together.
            return false;
        }
    }

    private async Task<ApplicationUser?> LockUserAsync(Guid userId, CancellationToken ct)
    {
        var user = db.Database.IsSqlServer()
            ? await db.Users.FromSqlInterpolated(
                $"SELECT * FROM [AspNetUsers] WITH (UPDLOCK, HOLDLOCK) WHERE [Id] = {userId}")
                .SingleOrDefaultAsync(ct)
            : await db.Users.SingleOrDefaultAsync(item => item.Id == userId, ct);
        if (user is not null) await db.Entry(user).ReloadAsync(ct);
        return user;
    }

    private Task<IdentityUserToken<Guid>?> GetStateAsync(Guid userId, string name, CancellationToken ct) =>
        db.UserTokens.SingleOrDefaultAsync(item => item.UserId == userId &&
            item.LoginProvider == Provider && item.Name == name, ct);

    private async Task<bool> AddressAvailableAsync(Guid userId, string address)
    {
        var emailOwner = await users.FindByEmailAsync(address);
        var nameOwner = await users.FindByNameAsync(address);
        return (emailOwner is null || emailOwner.Id == userId) &&
            (nameOwner is null || nameOwner.Id == userId);
    }

    private static bool ValidEmail(string value) => value.Length <= 256 &&
        MailAddress.TryCreate(value, out var parsed) && parsed.Address == value;
    private static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
    private static OwnershipState? ReadState(string? value)
    {
        try { return value is null ? null : JsonSerializer.Deserialize<OwnershipState>(value); }
        catch (JsonException) { return null; }
    }

    private sealed record OwnershipState(string CurrentEmail, string? NewEmail, string? TokenHash,
        DateTimeOffset RequestedAt, DateTimeOffset ExpiresAt);
}
