using BudgetApp.Application.Email;

namespace BudgetApp.Infrastructure.Email;

public sealed class ApplicationEmailLinkBuilder(ApplicationUrlOptions options)
    : IApplicationEmailLinkBuilder
{
    private readonly Uri _publicBaseUri = CreateBaseUri(options.PublicBaseUrl);

    public string BuildPasswordRecoveryLink(Guid userId, string token) =>
        BuildLink(
            "/reset-password",
            ("userId", userId.ToString()),
            ("token", token));

    public string BuildHouseholdInvitationLink(string token) =>
        BuildLink("/household-invitations/accept", ("token", token));

    private string BuildLink(
        string relativePath,
        params (string Name, string Value)[] parameters)
    {
        if (parameters.Length == 0 ||
            parameters.Any(parameter => string.IsNullOrWhiteSpace(parameter.Value)))
        {
            throw new ArgumentException(
                "Email link parameters cannot be empty.",
                nameof(parameters));
        }

        var target = new Uri(_publicBaseUri, relativePath);
        var builder = new UriBuilder(target)
        {
            Query = string.Join(
                '&',
                parameters.Select(parameter =>
                    $"{Uri.EscapeDataString(parameter.Name)}=" +
                    Uri.EscapeDataString(parameter.Value)))
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
