using System.Globalization;
using System.Net;

namespace BudgetApp.Application.Email;

public sealed class EmailTemplateFactory(IApplicationEmailLinkBuilder linkBuilder)
{
    public EmailMessage CreateEmailConfirmation(string recipientAddress, Guid userId, string token,
        DateTimeOffset expiresAtUtc, bool changeEmail)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(recipientAddress);
        ArgumentException.ThrowIfNullOrWhiteSpace(token);
        var link = linkBuilder.BuildEmailConfirmationLink(userId, token, changeEmail);
        var heading = changeEmail ? "Confirm your new MC Budget email address" : "Confirm your MC Budget email address";
        var expiry = FormatExpiry(expiresAtUtc);
        var explanation = changeEmail
            ? "Your current email address remains unchanged until you confirm this new address."
            : "Confirm your email address before viewing or accepting household invitations.";
        return new EmailMessage(recipientAddress.Trim(), heading,
            $"""
            {heading}

            {explanation}
            Sign in to the account that requested this link, then confirm your address:
            {link}

            This link expires {expiry} and can only be used once. Requesting a new link replaces this one.
            If you did not request this, do not confirm it. Your email address has not been verified or changed.
            If someone registered your address, use password recovery to secure the account before requesting a new confirmation link.
            If you need help, contact the person who manages your BudgetApp installation.
            """,
            $"""
            <!doctype html><html lang="en"><body>
            <h1>{WebUtility.HtmlEncode(heading)}</h1>
            <p>{WebUtility.HtmlEncode(explanation)}</p>
            <p>Sign in to the account that requested this link, then <a href="{WebUtility.HtmlEncode(link)}">confirm your email address</a>.</p>
            <p>This link expires {WebUtility.HtmlEncode(expiry)} and can only be used once. Requesting a new link replaces this one.</p>
            <p>If you did not request this, do not confirm it. Your email address has not been verified or changed.</p>
            <p>If someone registered your address, use password recovery to secure the account before requesting a new confirmation link.</p>
            <p>If you need help, contact the person who manages your BudgetApp installation.</p>
            </body></html>
            """, changeEmail ? EmailPurpose.EmailChange : EmailPurpose.EmailConfirmation);
    }

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
