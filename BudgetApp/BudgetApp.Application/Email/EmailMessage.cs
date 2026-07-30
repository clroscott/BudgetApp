namespace BudgetApp.Application.Email;

public sealed record EmailMessage(
    string RecipientAddress,
    string Subject,
    string PlainTextBody,
    string HtmlBody,
    EmailPurpose Purpose);

public enum EmailPurpose
{
    PasswordRecovery = 1,
    HouseholdInvitation = 2,
    Informational = 3
}
