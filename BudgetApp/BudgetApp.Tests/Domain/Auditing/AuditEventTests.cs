using BudgetApp.Domain.Auditing;

namespace BudgetApp.Tests.Domain.Auditing;

public sealed class AuditEventTests
{
    [Fact]
    public void Create_HouseholdEvent_HasNoPersonalOwner()
    {
        var auditEvent = AuditEvent.Create(
            Guid.NewGuid(),
            Guid.NewGuid(),
            AuditVisibility.Household,
            null,
            DateTimeOffset.UtcNow,
            "Updated",
            "Budget",
            Guid.NewGuid(),
            "Updated a budget.");

        Assert.Equal(AuditVisibility.Household, auditEvent.Visibility);
        Assert.Null(auditEvent.OwnerUserId);
    }

    [Fact]
    public void Create_PersonalEvent_RequiresOwner()
    {
        var exception = Assert.Throws<ArgumentException>(() =>
            AuditEvent.Create(
                Guid.NewGuid(),
                Guid.NewGuid(),
                AuditVisibility.Personal,
                null,
                DateTimeOffset.UtcNow,
                "Updated",
                "Transaction",
                Guid.NewGuid(),
                "Updated a transaction."));

        Assert.Contains("requires an owner", exception.Message);
    }

    [Fact]
    public void AuditEvent_ExposesNoMutationOrDeleteMethods()
    {
        var publicMethods = typeof(AuditEvent)
            .GetMethods()
            .Where(method =>
                method.DeclaringType == typeof(AuditEvent) &&
                method.IsPublic)
            .Select(method => method.Name)
            .ToList();

        Assert.DoesNotContain("Update", publicMethods);
        Assert.DoesNotContain("Delete", publicMethods);
        Assert.DoesNotContain("Remove", publicMethods);
    }
}
