using BudgetApp.Application.Households;
using BudgetApp.Domain.Households;

namespace BudgetApp.Application.Imports;

internal static class ImportAuthorization
{
    internal static void RequireVisible(ImportAccessRecord access, Guid userId)
    {
        if (access.IsPersonalAccount && access.AccountOwnerUserId != userId)
            throw new ImportNotFoundException();
    }

    internal static bool CanEdit(bool isPersonal, Guid? ownerId, HouseholdRole role, Guid userId) =>
        isPersonal ? ownerId == userId : role != HouseholdRole.Viewer;

    internal static void RequireEdit(ImportAccessRecord access, HouseholdRole role, Guid userId)
    {
        RequireVisible(access, userId);
        if (!CanEdit(access.IsPersonalAccount, access.AccountOwnerUserId, role, userId))
            throw new HouseholdAccessDeniedException();
    }
}
