/*
    BudgetApp Production/Scratch restore reconciliation

    READ-ONLY:
    - Automatically compares every user-table name and row count.
    - Compares selected financial totals that have business meaning.
    - Does not modify either database.

    New tables are included automatically. When a future table introduces a
    meaningful financial amount, add its total to the Financial Totals section.

    Run only after restoring the BudgetAppDb backup as BudgetAppDb_Scratch.
*/

USE [master];
GO

SET NOCOUNT ON;

IF DB_ID(N'BudgetAppDb') IS NULL
BEGIN
    THROW 51010, 'BudgetAppDb does not exist.', 1;
END;

IF DB_ID(N'BudgetAppDb_Scratch') IS NULL
BEGIN
    THROW 51011, 'BudgetAppDb_Scratch does not exist.', 1;
END;

/* Every current and future user table is discovered from SQL Server metadata. */
DECLARE @ProductionTables TABLE
(
    SchemaName sysname NOT NULL,
    TableName sysname NOT NULL,
    [RowCount] bigint NOT NULL,
    PRIMARY KEY (SchemaName, TableName)
);

DECLARE @ScratchTables TABLE
(
    SchemaName sysname NOT NULL,
    TableName sysname NOT NULL,
    [RowCount] bigint NOT NULL,
    PRIMARY KEY (SchemaName, TableName)
);

INSERT INTO @ProductionTables (SchemaName, TableName, [RowCount])
SELECT
    s.[name],
    t.[name],
    SUM(p.[rows])
FROM [BudgetAppDb].[sys].[tables] t
INNER JOIN [BudgetAppDb].[sys].[schemas] s
    ON s.[schema_id] = t.[schema_id]
INNER JOIN [BudgetAppDb].[sys].[partitions] p
    ON p.[object_id] = t.[object_id]
    AND p.[index_id] IN (0, 1)
WHERE t.[is_ms_shipped] = 0
GROUP BY s.[name], t.[name];

INSERT INTO @ScratchTables (SchemaName, TableName, [RowCount])
SELECT
    s.[name],
    t.[name],
    SUM(p.[rows])
FROM [BudgetAppDb_Scratch].[sys].[tables] t
INNER JOIN [BudgetAppDb_Scratch].[sys].[schemas] s
    ON s.[schema_id] = t.[schema_id]
INNER JOIN [BudgetAppDb_Scratch].[sys].[partitions] p
    ON p.[object_id] = t.[object_id]
    AND p.[index_id] IN (0, 1)
WHERE t.[is_ms_shipped] = 0
GROUP BY s.[name], t.[name];

SELECT
    [Schema] = COALESCE(p.SchemaName, s.SchemaName),
    [Table] = COALESCE(p.TableName, s.TableName),
    [ProductionRows] = p.[RowCount],
    [ScratchRows] = s.[RowCount],
    [Matches] = CONVERT(
        bit,
        CASE
            WHEN p.TableName IS NOT NULL
                AND s.TableName IS NOT NULL
                AND p.[RowCount] = s.[RowCount]
            THEN 1
            ELSE 0
        END)
FROM @ProductionTables p
FULL OUTER JOIN @ScratchTables s
    ON s.SchemaName = p.SchemaName
    AND s.TableName = p.TableName
ORDER BY
    COALESCE(p.SchemaName, s.SchemaName),
    COALESCE(p.TableName, s.TableName);

IF EXISTS
(
    SELECT 1
    FROM @ProductionTables p
    FULL OUTER JOIN @ScratchTables s
        ON s.SchemaName = p.SchemaName
        AND s.TableName = p.TableName
    WHERE
        p.TableName IS NULL
        OR s.TableName IS NULL
        OR p.[RowCount] <> s.[RowCount]
)
BEGIN
    THROW 51012, 'Restore reconciliation failed: one or more table names or row counts differ.', 1;
END;

/*
    Financial Totals

    Keep this list intentional. Add a metric when a future table introduces a
    new monetary value that should reconcile independently.
*/
DECLARE @ProductionTotals TABLE
(
    Metric nvarchar(100) NOT NULL PRIMARY KEY,
    MetricValue decimal(38, 4) NOT NULL
);

DECLARE @ScratchTotals TABLE
(
    Metric nvarchar(100) NOT NULL PRIMARY KEY,
    MetricValue decimal(38, 4) NOT NULL
);

INSERT INTO @ProductionTotals (Metric, MetricValue)
VALUES
    (N'Budgeted amount total', (SELECT COALESCE(SUM([BudgetedAmount]), 0) FROM [BudgetAppDb].[dbo].[BudgetLines])),
    (N'Recurring expense amount total', (SELECT COALESCE(SUM([Amount]), 0) FROM [BudgetAppDb].[dbo].[RecurringExpenses])),
    (N'Transaction net amount total', (SELECT COALESCE(SUM([Amount]), 0) FROM [BudgetAppDb].[dbo].[Transactions])),
    (N'Transaction money-in total', (SELECT COALESCE(SUM(CASE WHEN [Amount] < 0 THEN [Amount] ELSE 0 END), 0) FROM [BudgetAppDb].[dbo].[Transactions])),
    (N'Transaction spending total', (SELECT COALESCE(SUM(CASE WHEN [Amount] > 0 THEN [Amount] ELSE 0 END), 0) FROM [BudgetAppDb].[dbo].[Transactions]));

INSERT INTO @ScratchTotals (Metric, MetricValue)
VALUES
    (N'Budgeted amount total', (SELECT COALESCE(SUM([BudgetedAmount]), 0) FROM [BudgetAppDb_Scratch].[dbo].[BudgetLines])),
    (N'Recurring expense amount total', (SELECT COALESCE(SUM([Amount]), 0) FROM [BudgetAppDb_Scratch].[dbo].[RecurringExpenses])),
    (N'Transaction net amount total', (SELECT COALESCE(SUM([Amount]), 0) FROM [BudgetAppDb_Scratch].[dbo].[Transactions])),
    (N'Transaction money-in total', (SELECT COALESCE(SUM(CASE WHEN [Amount] < 0 THEN [Amount] ELSE 0 END), 0) FROM [BudgetAppDb_Scratch].[dbo].[Transactions])),
    (N'Transaction spending total', (SELECT COALESCE(SUM(CASE WHEN [Amount] > 0 THEN [Amount] ELSE 0 END), 0) FROM [BudgetAppDb_Scratch].[dbo].[Transactions]));

SELECT
    p.Metric,
    [ProductionValue] = p.MetricValue,
    [ScratchValue] = s.MetricValue,
    [Matches] = CONVERT(bit, CASE WHEN p.MetricValue = s.MetricValue THEN 1 ELSE 0 END)
FROM @ProductionTotals p
INNER JOIN @ScratchTotals s ON s.Metric = p.Metric
ORDER BY p.Metric;

IF EXISTS
(
    SELECT 1
    FROM @ProductionTotals p
    INNER JOIN @ScratchTotals s ON s.Metric = p.Metric
    WHERE p.MetricValue <> s.MetricValue
)
BEGIN
    THROW 51013, 'Restore reconciliation failed: one or more financial totals differ.', 1;
END;

PRINT N'RECONCILED: Production and Scratch table counts and financial totals match.';
GO
