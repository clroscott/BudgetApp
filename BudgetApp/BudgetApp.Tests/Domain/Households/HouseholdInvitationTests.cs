using BudgetApp.Domain.Households;

namespace BudgetApp.Tests.Domain.Households;

public sealed class HouseholdInvitationTests
{
    [Fact]
    public void Create_RejectsOwnerRole()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            HouseholdInvitation.Create(
                Guid.NewGuid(),
                "person@example.test",
                "PERSON@EXAMPLE.TEST",
                HouseholdRole.Owner,
                new string('A', HouseholdInvitation.TokenHashLength),
                Guid.NewGuid(),
                DateTimeOffset.UtcNow,
                DateTimeOffset.UtcNow.AddDays(7)));
    }

    [Fact]
    public void Resend_RotatesTokenAndRenewsExpiry()
    {
        var createdAt = new DateTimeOffset(
            2026,
            7,
            30,
            12,
            0,
            0,
            TimeSpan.Zero);
        var invitation = HouseholdInvitation.Create(
            Guid.NewGuid(),
            "person@example.test",
            "PERSON@EXAMPLE.TEST",
            HouseholdRole.Editor,
            new string('A', HouseholdInvitation.TokenHashLength),
            Guid.NewGuid(),
            createdAt,
            createdAt.AddDays(7));
        var resentAt = createdAt.AddDays(8);

        invitation.Resend(
            new string('B', HouseholdInvitation.TokenHashLength),
            Guid.NewGuid(),
            resentAt,
            resentAt.AddDays(7));

        Assert.Equal(new string('B', HouseholdInvitation.TokenHashLength), invitation.TokenHash);
        Assert.Equal(resentAt, invitation.LastSentAtUtc);
        Assert.False(invitation.IsExpired(resentAt));
    }

    [Fact]
    public void RevokedInvitation_CannotBeAccepted()
    {
        var now = DateTimeOffset.UtcNow;
        var invitation = HouseholdInvitation.Create(
            Guid.NewGuid(),
            "person@example.test",
            "PERSON@EXAMPLE.TEST",
            HouseholdRole.Viewer,
            new string('A', HouseholdInvitation.TokenHashLength),
            Guid.NewGuid(),
            now,
            now.AddDays(7));
        invitation.Revoke(now.AddMinutes(1));

        Assert.Throws<InvalidOperationException>(() =>
            invitation.Accept(Guid.NewGuid(), now.AddMinutes(2)));
    }
}
