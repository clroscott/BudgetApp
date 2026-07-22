using BudgetApp.Application.Households;
using BudgetApp.Domain.Households;

namespace BudgetApp.Tests.Application.Households;

public sealed class HouseholdAuthorizationServiceTests
{
    [Fact]
    public async Task RequireView_Viewer_ReturnsViewerRole()
    {
        var service = CreateService(HouseholdRole.Viewer);

        var role = await service.RequireViewAsync(
            Guid.NewGuid(),
            Guid.NewGuid(),
            CancellationToken.None);

        Assert.Equal(HouseholdRole.Viewer, role);
    }

    [Fact]
    public async Task RequireEdit_Viewer_ThrowsAccessDenied()
    {
        var service = CreateService(HouseholdRole.Viewer);

        await Assert.ThrowsAsync<HouseholdAccessDeniedException>(() =>
            service.RequireEditAsync(
                Guid.NewGuid(),
                Guid.NewGuid(),
                CancellationToken.None));
    }

    [Theory]
    [InlineData(HouseholdRole.Owner)]
    [InlineData(HouseholdRole.Admin)]
    [InlineData(HouseholdRole.Editor)]
    public async Task RequireEdit_EditRole_Succeeds(HouseholdRole role)
    {
        var service = CreateService(role);

        await service.RequireEditAsync(
            Guid.NewGuid(),
            Guid.NewGuid(),
            CancellationToken.None);
    }

    private static HouseholdAuthorizationService CreateService(HouseholdRole? role) =>
        new(new StubAuthorizationRepository(role));

    private sealed class StubAuthorizationRepository(HouseholdRole? role)
        : IHouseholdAuthorizationRepository
    {
        public Task<HouseholdRole?> GetActiveRoleAsync(
            Guid householdId,
            Guid userId,
            CancellationToken cancellationToken) =>
            Task.FromResult(role);
    }
}
