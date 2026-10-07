using System.Globalization;
using System.Net;

namespace BudgetApp.Application.Email;

public sealed class EmailTemplateFactory(IApplicationEmailLinkBuilder linkBuilder)
{
    public EmailMessage CreateLoginVerification(string address, string code, DateTimeOffset expires, string purpose)
    {
        var action = purpose switch {
            "Login" => "complete your MFA sign-in", "Enable" => "enable multi-factor authentication (MFA)",
            "Disable" => "turn off multi-factor authentication (MFA)", "RecoveryCodes" => "replace your recovery codes",
            "ChangePassword" => "change your password", "ChangeEmail" => "request an email change", _ => "verify a security action"
        };
        var expiry = FormatExpiry(expires);
        return new(address, "Your MC Budget verification code",
            $"Use this code to {action}:\n\n{code}\n\nExpires {expiry}. This code can only be used once. Resending replaces it. Never share it. If you did not request this action, do not use the code; secure your account.",
            $"<!doctype html><html lang=\"en\"><body><h1>MC Budget verification</h1><p>Use this code to {WebUtility.HtmlEncode(action)}:</p><p><strong>{WebUtility.HtmlEncode(code)}</strong></p><p>Expires {WebUtility.HtmlEncode(expiry)}. This code can only be used once. Resending replaces it. Never share it.</p><p>If you did not request this action, do not use the code; secure your account.</p></body></html>",
            EmailPurpose.LoginVerification);
    }

    public EmailMessage CreateLoginVerificationChanged(string address, string purpose)
    {
        var change = purpose switch {
            "Enable" => "Email multi-factor authentication (MFA) was enabled.",
            "Disable" => "Multi-factor authentication (MFA) was turned off. Future sign-ins use your password only.",
            _ => "Recovery codes were replaced. Older recovery codes no longer work."
        };
        return new(address, "Your MC Budget security settings changed",
            $"{change}\nIf you did not make this change, secure your account and contact the person who manages this installation.",
            $"<!doctype html><html lang=\"en\"><body><h1>Security settings changed</h1><p>{WebUtility.HtmlEncode(change)}</p><p>If you did not make this change, secure your account and contact the person who manages this installation.</p></body></html>", EmailPurpose.SecurityChange);
    }

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
