/*
    BudgetApp manual Production backup

    SAFE EFFECT:
    - Creates a new copy-only .bak file.
    - Verifies that SQL Server can read the completed backup.
    - Does not change BudgetAppDb.

    Before running:
    - Confirm the backup directory below is correct.
    - Confirm the SQL Server service account can write to that directory.
    - Run while connected to the intended local SQL Server instance.
*/

USE [master];
GO

SET NOCOUNT ON;

DECLARE @SourceDatabase sysname = N'BudgetAppDb';
DECLARE @BackupDirectory nvarchar(260) = N'C:\Apps\BudgetApp\backups';
DECLARE @Timestamp char(15) =
    CONVERT(char(8), GETDATE(), 112)
    + N'_'
    + REPLACE(CONVERT(char(8), GETDATE(), 108), N':', N'');
DECLARE @BackupFile nvarchar(4000);
DECLARE @BackupName nvarchar(128);

IF DB_ID(@SourceDatabase) IS NULL
BEGIN
    THROW 51000, 'Safety check failed: BudgetAppDb does not exist on this SQL Server instance.', 1;
END;

IF DATABASEPROPERTYEX(@SourceDatabase, 'Status') <> 'ONLINE'
BEGIN
    THROW 51001, 'Safety check failed: BudgetAppDb is not online.', 1;
END;

IF RIGHT(@BackupDirectory, 1) NOT IN (N'\', N'/')
BEGIN
    SET @BackupDirectory += N'\';
END;

SET @BackupFile =
    @BackupDirectory + @SourceDatabase + N'_' + @Timestamp + N'.bak';
SET @BackupName =
    N'BudgetAppDb copy-only backup ' + @Timestamp;

PRINT N'Creating copy-only backup: ' + @BackupFile;

BACKUP DATABASE [BudgetAppDb]
TO DISK = @BackupFile
WITH
    COPY_ONLY,
    CHECKSUM,
    INIT,
    NAME = @BackupName,
    STATS = 10;

PRINT N'Verifying backup checksums and readability...';

RESTORE VERIFYONLY
FROM DISK = @BackupFile
WITH CHECKSUM;

SELECT
    [BackupFile] = @BackupFile,
    [SourceDatabase] = @SourceDatabase,
    [CreatedAtServerTime] = SYSDATETIMEOFFSET(),
    [Verification] = N'RESTORE VERIFYONLY completed successfully';
GO
