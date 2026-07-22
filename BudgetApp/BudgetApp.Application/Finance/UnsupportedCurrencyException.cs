namespace BudgetApp.Application.Finance;

public sealed class UnsupportedCurrencyException(string currencyCode)
    : ArgumentException(
        $"The currency '{currencyCode}' is not supported.",
        nameof(currencyCode));
