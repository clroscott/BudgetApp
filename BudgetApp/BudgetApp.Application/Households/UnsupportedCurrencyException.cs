namespace BudgetApp.Application.Households;

public sealed class UnsupportedCurrencyException(string currencyCode)
    : ArgumentException(
        $"The currency '{currencyCode}' is not supported.",
        nameof(currencyCode));
