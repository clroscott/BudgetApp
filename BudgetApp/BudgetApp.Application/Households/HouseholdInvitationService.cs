using System.Net.Mail;
using BudgetApp.Application.Auditing;
using BudgetApp.Application.Email;
using BudgetApp.Domain.Auditing;
using BudgetApp.Domain.Households;

namespace BudgetApp.Application.Households;

public sealed class HouseholdInvitationService(
    IHouseholdInvitationRepository invitationRepository,
    IHouseholdInvitationTokenService tokenService,
    HouseholdAuthorizationService authorizationService,
    EmailTemplateFactory emailTemplateFactory,
    EmailDispatchService emailDispatchService,
    HouseholdLifecycleService lifecycleService,
    AuditWriter auditWriter,
    TimeProvider timeProvider)
{
    public static readonly TimeSpan InvitationLifespan = TimeSpan.FromDays(7);

    public async Task<HouseholdMemberManagement> GetManagementAsync(
        Guid householdId,
        Guid actorUserId,
        CancellationToken cancellationToken = default)
    {
        var actorRole = await authorizationService.RequireViewAsync(
            householdId,
            actorUserId,
            cancellationToken);
        var canManage = actorRole is HouseholdRole.Owner or HouseholdRole.Admin;
        var members = await invitationRepository.GetMembersAsync(
            householdId,
            cancellationToken);
        var invitations = canManage
            ? await invitationRepository.GetInvitationsAsync(
                householdId,
                cancellationToken)
            : [];
        var now = timeProvider.GetUtcNow();
        var exitOptions = await lifecycleService.GetExitOptionsAsync(
            householdId,
            actorUserId,
            cancellationToken);

        return new HouseholdMemberManagement(
            canManage,
            members,
            invitations.Select(invitation => ToItem(invitation, now)).ToList(),
            exitOptions);
    }

    public async Task<HouseholdInvitationDispatch> CreateAsync(
        Guid householdId,
        Guid actorUserId,
        string email,
        HouseholdRole role,
        CancellationToken cancellationToken = default)
    {
        var actorRole = await RequireManagerAsync(
            householdId,
            actorUserId,
            cancellationToken);
        EnsureCanAssign(actorRole, role);

        var (trimmedEmail, normalizedEmail) = NormalizeEmail(email);
        if (await invitationRepository.HasMemberWithEmailAsync(
                householdId,
                normalizedEmail,
                cancellationToken))
        {
            throw new HouseholdInvitationConflictException(
                "That email address already belongs to this household.");
        }

        if (await invitationRepository.GetPendingInvitationByEmailAsync(
                householdId,
                normalizedEmail,
                cancellationToken) is not null)
        {
            throw new HouseholdInvitationConflictException(
                "A pending invitation already exists for that email address. Resend or revoke it instead.");
        }

        var token = tokenService.Create();
        var now = timeProvider.GetUtcNow();
        var invitation = HouseholdInvitation.Create(
            householdId,
            trimmedEmail,
            normalizedEmail,
            role,
            token.TokenHash,
            actorUserId,
            now,
            now.Add(InvitationLifespan));

        invitationRepository.Add(invitation);
        RecordAudit(
            invitation,
            actorUserId,
            AuditActions.Invited,
            $"Invited a household member as {role}.");
        await invitationRepository.SaveChangesAsync(cancellationToken);

        var delivered = await DeliverAsync(
            invitation,
            actorUserId,
            token.RawToken,
            cancellationToken);

        return new HouseholdInvitationDispatch(
            ToItem(invitation, now),
            delivered);
    }

    public async Task<HouseholdInvitationDispatch> ResendAsync(
        Guid householdId,
        Guid invitationId,
        Guid actorUserId,
        CancellationToken cancellationToken = default)
    {
        var actorRole = await RequireManagerAsync(
            householdId,
            actorUserId,
            cancellationToken);
        var invitation = await GetInvitationAsync(
            householdId,
            invitationId,
            cancellationToken);
        EnsureCanAssign(actorRole, invitation.Role);

        var token = tokenService.Create();
        var now = timeProvider.GetUtcNow();
        invitation.Resend(
            token.TokenHash,
            actorUserId,
            now,
            now.Add(InvitationLifespan));
        RecordAudit(
            invitation,
            actorUserId,
            AuditActions.Resent,
            $"Resent a household invitation for the {invitation.Role} role.");
        await invitationRepository.SaveChangesAsync(cancellationToken);

        var delivered = await DeliverAsync(
            invitation,
            actorUserId,
            token.RawToken,
            cancellationToken);

        return new HouseholdInvitationDispatch(
            ToItem(invitation, now),
            delivered);
    }

    public async Task RevokeAsync(
        Guid householdId,
        Guid invitationId,
        Guid actorUserId,
        CancellationToken cancellationToken = default)
    {
        var actorRole = await RequireManagerAsync(
            householdId,
            actorUserId,
            cancellationToken);
        var invitation = await GetInvitationAsync(
            householdId,
            invitationId,
            cancellationToken);
        EnsureCanAssign(actorRole, invitation.Role);

        invitation.Revoke(timeProvider.GetUtcNow());
        RecordAudit(
            invitation,
            actorUserId,
            AuditActions.Revoked,
            $"Revoked a household invitation for the {invitation.Role} role.");
        await invitationRepository.SaveChangesAsync(cancellationToken);
    }

    public async Task<HouseholdInvitationPreview> GetPreviewAsync(
        string rawToken,
        CancellationToken cancellationToken = default)
    {
        var record = await invitationRepository.GetPreviewByTokenHashAsync(
                tokenService.Hash(rawToken),
                cancellationToken)
            ?? throw new HouseholdInvitationUnavailableException();
        var now = timeProvider.GetUtcNow();
        var available =
            record.Status == HouseholdInvitationStatus.Pending &&
            record.ExpiresAtUtc > now;

        return new HouseholdInvitationPreview(
            record.HouseholdName,
            record.InviterDisplayName,
            MaskEmail(record.Email),
            record.Role,
            record.ExpiresAtUtc,
            available,
            available
                ? "Pending"
                : record.Status == HouseholdInvitationStatus.Pending
                    ? "Expired"
                    : record.Status.ToString());
    }

    public async Task<HouseholdMembership> AcceptAsync(
        Guid userId,
        string rawToken,
        CancellationToken cancellationToken = default)
    {
        var invitation = await invitationRepository.GetTrackedByTokenHashAsync(
                tokenService.Hash(rawToken),
                cancellationToken)
            ?? throw new HouseholdInvitationUnavailableException();
        var now = timeProvider.GetUtcNow();

        if (invitation.Status != HouseholdInvitationStatus.Pending ||
            invitation.IsExpired(now))
        {
            throw new HouseholdInvitationUnavailableException();
        }

        var userEmail = await invitationRepository.GetUserEmailAsync(
                userId,
                cancellationToken)
            ?? throw new HouseholdInvitationEmailMismatchException();
        if (!userEmail.NormalizedEmail.Equals(
                invitation.NormalizedEmail,
                StringComparison.Ordinal))
        {
            throw new HouseholdInvitationEmailMismatchException();
        }

        var member = invitation.Household.AddInvitedMember(
            userId,
            invitation.Role,
            invitation.InvitedByUserId,
            now);
        invitationRepository.AddMember(member);
        invitation.Accept(userId, now);
        RecordAudit(
            invitation,
            userId,
            AuditActions.Accepted,
            $"Accepted a household invitation as {invitation.Role}.");
        await invitationRepository.SaveChangesAsync(cancellationToken);

        return new HouseholdMembership(
            invitation.HouseholdId,
            invitation.Household.Name,
            invitation.Household.DefaultCurrency,
            invitation.Household.TimeZoneId,
            invitation.Role);
    }

    private async Task<HouseholdRole> RequireManagerAsync(
        Guid householdId,
        Guid actorUserId,
        CancellationToken cancellationToken)
    {
        var role = await authorizationService.RequireViewAsync(
            householdId,
            actorUserId,
            cancellationToken);
        if (role is not HouseholdRole.Owner and not HouseholdRole.Admin)
        {
            throw new HouseholdAccessDeniedException();
        }

        return role;
    }

    private static void EnsureCanAssign(
        HouseholdRole actorRole,
        HouseholdRole targetRole)
    {
        if (targetRole is HouseholdRole.Owner ||
            actorRole == HouseholdRole.Admin &&
            targetRole == HouseholdRole.Admin)
        {
            throw new HouseholdAccessDeniedException();
        }
    }

    private async Task<HouseholdInvitation> GetInvitationAsync(
        Guid householdId,
        Guid invitationId,
        CancellationToken cancellationToken) =>
        await invitationRepository.GetInvitationAsync(
            householdId,
            invitationId,
            cancellationToken)
        ?? throw new HouseholdInvitationNotFoundException();

    private async Task<bool> DeliverAsync(
        HouseholdInvitation invitation,
        Guid actorUserId,
        string rawToken,
        CancellationToken cancellationToken)
    {
        var householdName = await invitationRepository.GetHouseholdNameAsync(
                invitation.HouseholdId,
                cancellationToken)
            ?? throw new HouseholdInvitationNotFoundException();
        var inviterName = await invitationRepository.GetUserDisplayNameAsync(
                actorUserId,
                cancellationToken)
            ?? "A household member";
        var message = emailTemplateFactory.CreateHouseholdInvitation(
            invitation.Email,
            householdName,
            inviterName,
            rawToken,
            invitation.ExpiresAtUtc);

        return (await emailDispatchService.SendAsync(
            message,
            cancellationToken)).Succeeded;
    }

    private void RecordAudit(
        HouseholdInvitation invitation,
        Guid actorUserId,
        string action,
        string summary,
        Guid? entityId = null)
    {
        auditWriter.Record(new AuditEventInput(
            invitation.HouseholdId,
            actorUserId,
            AuditVisibility.Household,
            null,
            action,
            AuditEntityTypes.HouseholdInvitation,
            entityId ?? invitation.Id,
            summary,
            new Dictionary<string, string?>
            {
                ["Role"] = invitation.Role.ToString()
            }));
    }

    private static HouseholdInvitationItem ToItem(
        HouseholdInvitation invitation,
        DateTimeOffset nowUtc) =>
        new(
            invitation.Id,
            invitation.Email,
            invitation.Role,
            invitation.IsExpired(nowUtc)
                ? "Expired"
                : invitation.Status.ToString(),
            invitation.CreatedAtUtc,
            invitation.LastSentAtUtc,
            invitation.ExpiresAtUtc);

    private static (string Email, string NormalizedEmail) NormalizeEmail(
        string email)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(email);
        var trimmed = email.Trim();
        if (!MailAddress.TryCreate(trimmed, out var parsed) ||
            !parsed.Address.Equals(trimmed, StringComparison.OrdinalIgnoreCase))
        {
            throw new ArgumentException(
                "Enter a valid email address.",
                nameof(email));
        }

        return (trimmed, trimmed.ToUpperInvariant());
    }

    private static string MaskEmail(string email)
    {
        var separator = email.IndexOf('@');
        if (separator <= 0)
        {
            return "***";
        }

        return $"{email[0]}***{email[separator..]}";
    }
}
