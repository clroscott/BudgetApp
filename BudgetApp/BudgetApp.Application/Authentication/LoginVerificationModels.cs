using System.ComponentModel.DataAnnotations;

namespace BudgetApp.Application.Authentication;

public enum VerificationPurpose { Login, Enable, Disable, RecoveryCodes, ChangePassword, ChangeEmail, Administration }
public sealed record VerificationProof(Guid ChallengeId, [param: Required, StringLength(100)] string Code, bool UseRecoveryCode = false);
public sealed record VerificationChallenge(Guid ChallengeId, DateTimeOffset ExpiresAtUtc,
    DateTimeOffset ResendAtUtc, DateTimeOffset ChallengeExpiresAtUtc, bool Delivered);
public sealed record LoginVerificationStatus(bool EmailEnabled, int RecoveryCodesRemaining);
