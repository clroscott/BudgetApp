using System.Security.Cryptography;
using System.Text;
using BudgetApp.Application.Households;

namespace BudgetApp.Infrastructure.Households;

internal sealed class HouseholdInvitationTokenService
    : IHouseholdInvitationTokenService
{
    public HouseholdInvitationToken Create()
    {
        var bytes = RandomNumberGenerator.GetBytes(32);
        var rawToken = Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');

        return new HouseholdInvitationToken(rawToken, Hash(rawToken));
    }

    public string Hash(string rawToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(rawToken);
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(rawToken));
        return Convert.ToHexString(hash);
    }
}
