SELECT [s].[Currency], [s].[Month], [s].[CategoryId], [s].[Type0] AS [CategoryType], COALESCE(SUM(CASE
    WHEN [s].[Type0] = 'Expense' THEN [s].[Amount]
    WHEN [s].[CategoryId] IS NULL AND [s].[Amount] > 0.0 THEN [s].[Amount]
    ELSE 0.0
END), 0.0) AS [SpendingAmount], COALESCE(SUM(CASE
    WHEN ([s].[Type0] = 'Income' OR [s].[CategoryId] IS NULL) AND [s].[Amount] < 0.0 THEN -[s].[Amount]
    ELSE 0.0
END), 0.0) AS [IncomeAmount], COUNT(*) AS [Count]
FROM (
    SELECT [t].[Amount], [t].[CategoryId], [a].[Currency], [c].[Type] AS [Type0], DATEPART(month, [t].[TransactionDate]) AS [Month]
    FROM [Transactions] AS [t]
    INNER JOIN [Accounts] AS [a] ON [t].[AccountId] = [a].[Id]
    LEFT JOIN [Categories] AS [c] ON [t].[CategoryId] = [c].[Id]
    WHERE [t].[HouseholdId] = @householdId AND [t].[TransactionDate] >= @fromDate AND [t].[TransactionDate] <= @toDate AND [t].[IsVoided] = CAST(0 AS bit) AND [t].[IsExcludedFromBudget] = CAST(0 AS bit) AND ([t].[IncludeInHouseholdBudget] = CAST(1 AS bit) OR ([t].[IncludeInHouseholdBudget] IS NULL AND [a].[Scope] = 'Household'))
) AS [s]
GROUP BY [s].[Currency], [s].[Month], [s].[CategoryId], [s].[Type0]