using BudgetApp.Server.Configuration;

namespace BudgetApp.Tests.Server;

public sealed class DatabaseEnvironmentGuardTests
{
    [Theory]
    [InlineData("Development", "BudgetAppDb_DEV")]
    [InlineData("Production", "BudgetAppDb")]
    [InlineData("Scratch", "BudgetAppDb_Scratch")]
    public void Validate_WithExpectedDatabase_ReturnsSafeConnectionMetadata(
        string environmentName,
        string databaseName)
    {
        var result = DatabaseEnvironmentGuard.Validate(
            environmentName,
            $"Server=BIG-Z\\SQLEXPRESS;Database={databaseName};Integrated Security=True;",
            databaseName);

        Assert.Equal("BIG-Z\\SQLEXPRESS", result.ServerName);
        Assert.Equal(databaseName, result.DatabaseName);
    }

    [Theory]
    [InlineData("Development", "BudgetAppDb", "BudgetAppDb_DEV")]
    [InlineData("Development", "BudgetAppDb_Scratch", "BudgetAppDb_DEV")]
    [InlineData("Production", "BudgetAppDb_DEV", "BudgetAppDb")]
    [InlineData("Production", "BudgetAppDb_Scratch", "BudgetAppDb")]
    [InlineData("Scratch", "BudgetAppDb", "BudgetAppDb_Scratch")]
    [InlineData("Scratch", "BudgetAppDb_DEV", "BudgetAppDb_Scratch")]
    public void Validate_WithWrongEnvironmentDatabase_IsRejected(
        string environmentName,
        string configuredDatabase,
        string expectedDatabase)
    {
        var exception = Assert.Throws<InvalidOperationException>(() =>
            DatabaseEnvironmentGuard.Validate(
                environmentName,
                $"Server=localhost;Initial Catalog={configuredDatabase};Integrated Security=True;",
                expectedDatabase));

        Assert.Contains(configuredDatabase, exception.Message);
        Assert.Contains(expectedDatabase, exception.Message);
    }

    [Fact]
    public void Validate_TestingEnvironment_DoesNotRequireSqlServerDatabaseName()
    {
        var result = DatabaseEnvironmentGuard.Validate(
            "Testing",
            "Data Source=integration-tests",
            expectedDatabaseName: null);

        Assert.Equal("integration-tests", result.ServerName);
        Assert.Equal("(not specified)", result.DatabaseName);
    }
}
