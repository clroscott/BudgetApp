namespace BudgetApp.Application.Households;

public sealed class UnsupportedTimeZoneException(string timeZoneId)
    : ArgumentException(
        $"The time zone '{timeZoneId}' is not supported.",
        nameof(timeZoneId));
