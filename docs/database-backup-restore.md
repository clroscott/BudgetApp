# Manual Production Database Backup and Restore

## Purpose

This procedure creates a full SQL Server backup of the real local `BudgetAppDb` database and proves that it can be restored as `BudgetAppDb_Scratch`.

This protects against a bad migration, application mistake, or database corruption that leaves the SQL Server installation usable. A backup stored only on the same physical disk does not protect against disk failure, theft, fire, or loss of the entire computer.

## Data Sensitivity

A SQL backup contains everything in the database, including:

- household financial records;
- account metadata;
- user email addresses and profile information;
- ASP.NET Core Identity password hashes and tokens;
- imported transaction descriptions;
- budgets, rules, and household configuration.

Treat every `.bak` file as highly sensitive:

- never commit it to Git or attach it to a GitHub issue;
- never put it inside `C:\Apps\BudgetApp\publish`;
- do not email it or place it in unencrypted public storage;
- restrict the backup folder to the Windows and SQL Server identities that require access;
- keep the computer or backup drive encrypted;
- eventually maintain a protected second copy on another physical device or secure location.

The repository ignores SQL backup extensions, but that is only a final guard—not the primary protection.

## Current Locations

```text
Production database: BudgetAppDb
Restore-test database: BudgetAppDb_Scratch
Backup folder: C:\Apps\BudgetApp\backups
```

The issue description uses `BudgetAppScratchDb` in one place. The actual configured database name is `BudgetAppDb_Scratch`; use that exact name.

## Responsibilities

Codex maintains:

- the guarded backup SQL template;
- the read-only reconciliation SQL;
- this procedure and its safety checks.

The local operator:

- confirms the SQL Server instance and destination names in SSMS;
- runs the Production backup;
- performs the restore through SSMS;
- verifies reconciliation;
- removes real Production data from Scratch after the drill.

No application process should be running against Scratch during the restore drill.

## Part 1: Create and Verify a Production Backup

### 1. Confirm the folder

Create:

```text
C:\Apps\BudgetApp\backups
```

The SQL Server service account—not only the interactive Windows user—must be able to write to this folder. If SQL reports `Operating system error 5 (Access is denied)`, grant the SQL Server service identity Modify permission to this exact folder rather than running SSMS as administrator.

The SQL Server service identity can be viewed in SQL Server Configuration Manager or with this SSMS query:

```sql
SELECT servicename, service_account
FROM sys.dm_server_services
WHERE servicename LIKE 'SQL Server (%';
```

### 2. Open the reviewed backup template

In SSMS:

1. Connect to the local SQL Server instance that contains `BudgetAppDb`.
2. Open `tools\sql\backup-production.sql`.
3. Confirm the script names:
   - source database `BudgetAppDb`;
   - folder `C:\Apps\BudgetApp\backups`.
4. Execute it.

The script:

- refuses to proceed if `BudgetAppDb` is missing or offline;
- creates a uniquely timestamped `.bak`;
- uses `COPY_ONLY` so it does not disturb a future regular backup chain;
- enables backup checksums;
- runs `RESTORE VERIFYONLY` after creation;
- never changes Production data.

Successful output ends with a result similar to:

```text
BudgetAppDb_20260729_183000.bak
RESTORE VERIFYONLY completed successfully
```

`RESTORE VERIFYONLY` proves that SQL Server can read the backup structure and checksums. It does not replace a real restore rehearsal.

### 3. Confirm the file

In File Explorer, confirm:

- the timestamped `.bak` exists;
- its size is greater than zero;
- it is under `C:\Apps\BudgetApp\backups`, not `publish`.

Do not rename or move the only copy until the restore rehearsal is complete.

## Part 2: Restore the Backup into Scratch

This operation replaces the contents of `BudgetAppDb_Scratch`. It must never target `BudgetAppDb`.

### 1. Stop competing applications

- Stop any BudgetApp process running in the `Scratch` environment.
- Stop any query window currently using `BudgetAppDb_Scratch`.
- The normal published Production app can remain running for this first controlled drill, but do not enter or import new data between the backup and reconciliation.

### 2. Start the SSMS restore wizard

1. In Object Explorer, right-click **Databases**.
2. Choose **Restore Database...**
3. Under **Source**, select **Device**.
4. Choose the timestamped `.bak` from `C:\Apps\BudgetApp\backups`.
5. Under **Destination**, manually set the database name to:

```text
BudgetAppDb_Scratch
```

Before continuing, read the destination again. If it says `BudgetAppDb`, cancel.

### 3. Relocate the database files

Open the **Files** page.

Enable relocation if SSMS offers **Relocate all files to folder**, or manually ensure the restored data and log filenames are Scratch-specific. They must not point at the live Production `.mdf` or `.ldf`.

Typical target names are:

```text
BudgetAppDb_Scratch.mdf
BudgetAppDb_Scratch_log.ldf
```

Use the SQL Server instance's existing data and log directories; do not guess a different system folder.

### 4. Set restore options

On the **Options** page:

- select **Overwrite the existing database (WITH REPLACE)** only because the confirmed destination is `BudgetAppDb_Scratch`;
- select **Close existing connections to destination database** if needed;
- leave the recovery state as **RESTORE WITH RECOVERY**.

Return to the General page once more and confirm the destination is `BudgetAppDb_Scratch`, then start the restore.

### 5. Verify the restored database identity

Run:

```sql
SELECT
    DB_NAME() AS CurrentDatabase,
    DATABASEPROPERTYEX(DB_NAME(), 'Status') AS DatabaseStatus;
```

The SSMS database selector must show `BudgetAppDb_Scratch`, and the status must be `ONLINE`.

## Part 3: Reconcile the Restore

In SSMS:

1. Open `tools\sql\reconcile-production-and-scratch.sql`.
2. Confirm it references only `BudgetAppDb` and `BudgetAppDb_Scratch`.
3. Execute it.

The query compares:

- every application and Identity table name and row count, discovered automatically from SQL Server metadata;
- total transaction amounts;
- total budget-line amounts;
- total recurring-expense amounts.

New tables are included in the row-count comparison automatically. If a future
table adds another meaningful monetary value, its financial-total comparison
must be added deliberately to the reconciliation script.

Every `Matches` value must be `1`, and the Messages tab must end with:

```text
RECONCILED: Production and Scratch counts and financial totals match.
```

If reconciliation fails:

1. Do not treat the backup as proven.
2. Confirm no Production changes occurred after the backup.
3. Confirm the correct `.bak` was restored.
4. Preserve the failed result long enough to diagnose it, without posting financial values publicly.

## Part 4: Clean Up the Restore Drill

During the drill, Scratch contains a complete copy of real Production data, including authentication records. Treat it as Production-sensitive.

After reconciliation:

1. Close queries using `BudgetAppDb_Scratch`.
2. In SSMS, confirm the exact selected database is `BudgetAppDb_Scratch`.
3. Delete `BudgetAppDb_Scratch`.
4. Create a new empty `BudgetAppDb_Scratch`.
5. Do not restore Production data into it again unless performing another controlled restore drill.

The Scratch environment normally contains only disposable fictional data. The Production-derived restore is a temporary, documented exception.

## Backup Completion Record

For each backup used before a risky change, record without exposing financial data:

- source Git commit;
- backup filename;
- creation time;
- backup size;
- `RESTORE VERIFYONLY` result;
- whether a Scratch restore was completed;
- reconciliation result;
- location of the protected second copy, if one exists.

Do not record passwords, connection strings, user details, or financial totals in GitHub.

## Retention

Until an automated retention policy exists:

- keep at least the latest known-good backup;
- keep the pre-migration backup for any deployed schema change;
- do not delete an older known-good backup merely because a newer file was created;
- periodically test a recent backup against Scratch;
- remove obsolete files deliberately after confirming another verified backup exists.

## What This Does Not Provide

This procedure is a full-database operational backup. It is not the portable household export described in issue #111.

Application-level work still required includes:

- human-readable transaction CSV export;
- a versioned household backup archive;
- authorization checks;
- validation and preview before restore;
- restore into a new empty household;
- automated round-trip and cross-household tests.

## Related Documentation

- [Database environments](database-environments.md)
- [Initial local Production installation](local-production-installation.md)
- [Clean development machine setup](development-setup.md)
