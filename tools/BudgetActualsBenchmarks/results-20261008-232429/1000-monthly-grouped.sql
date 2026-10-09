SELECT [a].[Currency], [t].[CategoryId], COALESCE(SUM([t].[Amount]), 0.0) AS [Amount], COUNT(*) AS [Count]
FROM [Transactions] AS [t]
INNER JOIN [Accounts] AS [a] ON [t].[AccountId] = [a].[Id]
LEFT JOIN [Categories] AS [c] ON [t].[CategoryId] = [c].[Id]
WHERE [t].[HouseholdId] = @householdId AND [t].[TransactionDate] >= @fromDate AND [t].[TransactionDate] <= @toDate AND [t].[IsVoided] = CAST(0 AS bit) AND [t].[IsExcludedFromBudget] = CAST(0 AS bit) AND ([t].[IncludeInHouseholdBudget] = CAST(1 AS bit) OR ([t].[IncludeInHouseholdBudget] IS NULL AND [a].[Scope] = 'Household')) AND ([c].[Type] IS NULL OR [c].[Type] = 'Expense')
GROUP BY [a].[Currency], [t].[CategoryId]