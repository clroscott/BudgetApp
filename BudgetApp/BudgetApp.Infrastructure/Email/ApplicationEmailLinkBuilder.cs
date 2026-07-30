using BudgetApp.Application.Email;

namespace BudgetApp.Infrastructure.Email;

public sealed class ApplicationEmailLinkBuilder(ApplicationUrlOptions options)
    : IApplicationEmailLinkBuilder
{
    private readonly Uri _publicBaseUri = CreateBaseUri(options.PublicBaseUrl);

    public string BuildPasswordRecoveryLink(string token) =>
        BuildLink("/reset-password", token);

    public string BuildHouseholdInvitationLink(string token) =>
        BuildLink("/household-invitations/accept", token);

    private string BuildLink(string relativePath, string token)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(token);

        var target = new Uri(_publicBaseUri, relativePath);
        var builder = new UriBuilder(target)
        {
            Query = $"token={Uri.EscapeDataString(token)}"
        };

        return builder.Uri.AbsoluteUri;
    }

    private static Uri CreateBaseUri(string value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var baseUri) ||
            (baseUri.Scheme != Uri.UriSchemeHttps &&
             baseUri.Scheme != Uri.UriSchemeHttp))
        {
            throw new InvalidOperationException(
                "Application:PublicBaseUrl must be an absolute HTTP or HTTPS URL.");
        }

        return new Uri(baseUri.AbsoluteUri.TrimEnd('/') + '/');
    }
}
