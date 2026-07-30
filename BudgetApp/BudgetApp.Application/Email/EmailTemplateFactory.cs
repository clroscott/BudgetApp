using System.Globalization;
using System.Net;

namespace BudgetApp.Application.Email;

public sealed class EmailTemplateFactory(IApplicationEmailLinkBuilder linkBuilder)
{
    public EmailMessage CreatePasswordRecovery(
        string recipientAddress,
        Guid userId,
        string token,
        DateTimeOffset expiresAtUtc)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(recipientAddress);
        ArgumentException.ThrowIfNullOrWhiteSpace(token);

        var recoveryLink = linkBuilder.BuildPasswordRecoveryLink(userId, token);
        var expiry = FormatExpiry(expiresAtUtc);
        var encodedLink = WebUtility.HtmlEncode(recoveryLink);
        var encodedExpiry = WebUtility.HtmlEncode(expiry);

        return new EmailMessage(
            recipientAddress.Trim(),
            "Reset your MC Budget password",
            $"""
            A password reset was requested for your MC Budget account.

            Open this link to choose a new password:
            {recoveryLink}

            This link expires {expiry} and can only be used once.

            If you did not request this, you can ignore this message. Your password has not been changed.
            If you need help, contact the person who manages your BudgetApp installation.
            """,
            $"""
            <!doctype html>
            <html lang="en">
            <body>
              <h1>Reset your MC Budget password</h1>
              <p>A password reset was requested for your MC Budget account.</p>
              <p><a href="{encodedLink}">Choose a new password</a></p>
              <p>This link expires {encodedExpiry} and can only be used once.</p>
              <p>If you did not request this, you can ignore this message. Your password has not been changed.</p>
              <p>If you need help, contact the person who manages your BudgetApp installation.</p>
            </body>
            </html>
            """,
            EmailPurpose.PasswordRecovery);
    }

    public EmailMessage CreateHouseholdInvitation(
        string recipientAddress,
        string householdName,
        string inviterDisplayName,
        string token,
        DateTimeOffset expiresAtUtc)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(recipientAddress);
        ArgumentException.ThrowIfNullOrWhiteSpace(householdName);
        ArgumentException.ThrowIfNullOrWhiteSpace(inviterDisplayName);
        ArgumentException.ThrowIfNullOrWhiteSpace(token);

        var invitationLink = linkBuilder.BuildHouseholdInvitationLink(token);
        var expiry = FormatExpiry(expiresAtUtc);

        return new EmailMessage(
            recipientAddress.Trim(),
            $"Invitation to join {householdName} in MC Budget",
            $"""
            {inviterDisplayName} invited you to join the {householdName} household in MC Budget.

            Open this link to review the invitation:
            {invitationLink}

            This invitation expires {expiry} and can only be accepted once.

            If you were not expecting this invitation, you can ignore this message.
            If you need help, contact the person who invited you or the person who manages the BudgetApp installation.
            """,
            $"""
            <!doctype html>
            <html lang="en">
            <body>
              <h1>Household invitation</h1>
              <p>{WebUtility.HtmlEncode(inviterDisplayName)} invited you to join the
                 <strong>{WebUtility.HtmlEncode(householdName)}</strong> household in MC Budget.</p>
              <p><a href="{WebUtility.HtmlEncode(invitationLink)}">Review the invitation</a></p>
              <p>This invitation expires {WebUtility.HtmlEncode(expiry)} and can only be accepted once.</p>
              <p>If you were not expecting this invitation, you can ignore this message.</p>
              <p>If you need help, contact the person who invited you or the person who manages the BudgetApp installation.</p>
            </body>
            </html>
            """,
            EmailPurpose.HouseholdInvitation);
    }

    private static string FormatExpiry(DateTimeOffset expiresAtUtc) =>
        expiresAtUtc.ToUniversalTime().ToString(
            "MMMM d, yyyy 'at' h:mm tt 'UTC'",
            CultureInfo.InvariantCulture);
}
