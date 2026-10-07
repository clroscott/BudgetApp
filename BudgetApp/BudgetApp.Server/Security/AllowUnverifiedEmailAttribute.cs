namespace BudgetApp.Server.Security;

/// <summary>Allows account maintenance while the signed-in user is awaiting email confirmation.</summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class AllowUnverifiedEmailAttribute : Attribute;
