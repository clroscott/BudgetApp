namespace BudgetApp.Application.Email;

public sealed class EmailDeliveryException : Exception
{
    public EmailDeliveryException(
        string message,
        Exception? innerException = null,
        EmailDeliveryFailureKind failureKind = EmailDeliveryFailureKind.Unspecified)
        : base(message, innerException)
    {
        FailureKind = failureKind;
    }

    public EmailDeliveryFailureKind FailureKind { get; }
}

public enum EmailDeliveryFailureKind
{
    Unspecified,
    Disabled,
    InvalidMessage,
    Authentication,
    SecureConnection,
    Rejected,
    Timeout,
    Connection
}
