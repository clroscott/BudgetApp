# Local Production Deployment Checklist

## Purpose

Use this checklist whenever an existing local Production installation is
upgraded. It protects both parts of BudgetApp that must move together:

- the published application files in `C:\Apps\BudgetApp\publish`;
- the real household data and schema in `BudgetAppDb`.

Git can recover an earlier application revision. It cannot undo a database
migration, import, or financial-data change. A verified SQL backup is therefore
required before every Production schema or data migration.

This checklist assumes the initial installation described in
[Initial local Production installation](local-production-installation.md) is
already working.

## Deployment Rules

- Deploy only a reviewed, committed revision.
- Never publish directly into the live `publish` folder.
- Never use `BudgetAppDb` for migration development or rehearsal.
- Never apply an unreviewed migration command directly to Production.
- Keep the previous application package until the new deployment is proven.
- Keep the pre-deployment `.bak` until a later backup and restore have also been
  proven.
- Do not enter or import financial data while deployment or rollback is in
  progress.
- A code rollback and database rollback are separate decisions. Perform both
  when the old code is incompatible with the new schema.

## Current Locations

```text
Live application:       C:\Apps\BudgetApp\publish
Previous releases:      C:\Apps\BudgetApp\releases
Certificate:            C:\Apps\BudgetApp\certs\budgetapp.p12
Certificate credential: C:\Apps\BudgetApp\secrets\certificate.credential
Database backups:       C:\Apps\BudgetApp\backups
Production database:    BudgetAppDb
Development database:   BudgetAppDb_DEV
Scratch database:       BudgetAppDb_Scratch
Staged repository build: .\artifacts\local-production-next
```

## Deployment Record

Record this information locally before starting. Do not include secrets,
connection strings, personal data, or financial totals.

```text
Deployment date/time:
New Git commit:
Previous Git commit/package:
Database migration included: Yes / No
Migration range or names:
Pre-deployment backup filename:
Migration rehearsal database:
Package verification result:
Production smoke-test result:
Rollback performed: No / Code / Database / Both
```

The record may be kept outside the repository under
`C:\Apps\BudgetApp\releases`. It does not need to be committed.

## Phase 1: Prove the Source Revision

- [ ] Confirm the intended branch and revision are checked out.
- [ ] Confirm all intended changes are committed.
- [ ] Confirm there are no unexpected uncommitted files.
- [ ] Record the new commit ID.
- [ ] Review the commits and EF Core migrations included since the previous
      deployment.
- [ ] Confirm no secret, certificate, database, backup, or real CSV file is
      included.

From the repository root:

```powershell
git status
git log -1 --oneline
.\tools\verify-development-environment.cmd
```

Run the automated tests:

```powershell
dotnet test ".\BudgetApp\BudgetApp.Tests\BudgetApp.Tests.csproj" `
    --configuration Release
```

Build the Production package into the ignored staging folder:

```powershell
dotnet publish `
    ".\BudgetApp\BudgetApp.Server\BudgetApp.Server.csproj" `
    --configuration Release `
    --output ".\artifacts\local-production-next"

.\tools\verify-local-production-package.cmd `
    ".\artifacts\local-production-next"
```

- [ ] Tests pass.
- [ ] Package verification reports `READY`.
- [ ] `wwwroot\index.html` exists in the staged package.
- [ ] The staged package contains no local secrets or data.

Do not stop the working Production app merely because a build fails. Correct
the source or package first.

## Phase 2: Classify the Database Change

Choose exactly one:

- [ ] **Code only:** no new EF Core migration and no Production data-change
      script.
- [ ] **Schema/data change:** one or more migrations or scripts will change
      `BudgetAppDb`.

For a code-only deployment, continue to Phase 4.

For a schema/data change:

- [ ] Read every new migration and its generated SQL.
- [ ] Identify destructive or irreversible operations such as dropping,
      renaming, narrowing, or rewriting columns.
- [ ] Confirm the application and schema versions must be deployed together.
- [ ] Generate a reviewable idempotent migration script into the ignored
      artifacts folder.

```powershell
dotnet tool restore

dotnet tool run dotnet-ef migrations script `
    --idempotent `
    --project ".\BudgetApp\BudgetApp.Infrastructure\BudgetApp.Infrastructure.csproj" `
    --startup-project ".\BudgetApp\BudgetApp.Server\BudgetApp.Server.csproj" `
    --output ".\artifacts\budgetapp-migration.sql"
```

The script may contain the full migration history; EF's migration-history checks
determine which statements are pending. Review the script before running it.

## Phase 3: Rehearse Database Changes

Every Production migration must first succeed against `BudgetAppDb_DEV` or
`BudgetAppDb_Scratch`.

Use Development for ordinary additive migrations. Use Scratch for risky changes,
data transformations, restore rehearsals, or whenever Production-shaped data is
needed to expose migration problems.

### Minimum Development rehearsal

- [ ] Confirm Visual Studio/Development logs name `BudgetAppDb_DEV`.
- [ ] Apply the pending migrations to `BudgetAppDb_DEV`.
- [ ] Start the application in Development.
- [ ] Exercise the changed workflow using fictional data.
- [ ] Confirm existing Development workflows still load.

See [Database environments](database-environments.md) for the exact Development
migration command.

### Stronger Scratch rehearsal

For a risky migration:

1. Create the verified Production backup described in
   [Manual Production database backup and restore](database-backup-restore.md).
2. Restore it as `BudgetAppDb_Scratch`, never as `BudgetAppDb`.
3. Run the reconciliation query to prove the restore.
4. Apply `.\artifacts\budgetapp-migration.sql` to
   `BudgetAppDb_Scratch` in SSMS.
5. Confirm the migration completes and
   `dbo.__EFMigrationsHistory` contains the expected entries.
6. Run relevant read-only queries and application tests against Scratch.
7. Treat Scratch as Production-sensitive until it is deleted and recreated.

- [ ] Rehearsal target was Development or Scratch—not Production.
- [ ] Migration completed without ignored warnings or errors.
- [ ] Expected tables, columns, constraints, and migration-history entries exist.
- [ ] Important record counts and financial totals remain plausible.
- [ ] The changed feature works with fictional or controlled test data.

Do not deploy a migration that failed rehearsal.

## Phase 4: Prepare the Recoverable Code Swap

Create the releases folder if it does not exist:

```powershell
New-Item -ItemType Directory -Force "C:\Apps\BudgetApp\releases"
```

Choose a unique release label containing the date/time and short commit ID, for
example:

```text
publish-20260729-1830-a1b2c3d
```

- [ ] Record the currently deployed revision if known.
- [ ] Confirm sufficient disk space for both current and new packages.
- [ ] Copy the staged package to a new, uniquely named folder under
      `C:\Apps\BudgetApp\releases`.
- [ ] Run `verify-local-production-package.cmd` against that copied package.
- [ ] Do not modify the current `publish` folder yet.

Example:

```powershell
$newRelease =
    "C:\Apps\BudgetApp\releases\publish-<timestamp>-<short-commit>"

New-Item -ItemType Directory $newRelease

Copy-Item `
    ".\artifacts\local-production-next\*" `
    $newRelease `
    -Recurse

.\tools\verify-local-production-package.cmd $newRelease
```

Replace both placeholders before running the commands.

## Phase 5: Production Backup and Maintenance Window

For a schema/data change, the final backup must represent the database immediately
before deployment:

1. Ask household users to stop using BudgetApp.
2. Stop the published application with `Ctrl+C`.
3. Run `tools\sql\backup-production.sql` in SSMS.
4. Confirm `RESTORE VERIFYONLY` succeeds.
5. Confirm the timestamped `.bak` exists and is larger than zero.
6. Record its filename and creation time.
7. Do not allow new Production activity until deployment succeeds or rollback
   completes.

- [ ] Published BudgetApp is stopped.
- [ ] No user is entering or importing data.
- [ ] Verified pre-deployment backup exists for schema/data changes.
- [ ] The backup is outside `publish` and is not tracked by Git.

A code-only deployment does not strictly require a new database backup because
it does not change the database. Taking one is still encouraged before any
meaningful release.

## Phase 6: Deploy

Keep the old package intact. Rename it rather than copying new files over it.

From a PowerShell window where BudgetApp is stopped:

```powershell
$deploymentTimestamp = Get-Date -Format "yyyyMMdd-HHmmss"

Move-Item `
    "C:\Apps\BudgetApp\publish" `
    "C:\Apps\BudgetApp\releases\publish-previous-$deploymentTimestamp"

Move-Item `
    "C:\Apps\BudgetApp\releases\publish-<timestamp>-<short-commit>" `
    "C:\Apps\BudgetApp\publish"
```

Replace the new-release placeholder with the exact folder prepared in Phase 4.

For a schema/data change:

1. In SSMS, confirm the database selector says `BudgetAppDb`.
2. Confirm the verified backup filename is recorded.
3. Execute the reviewed `.\artifacts\budgetapp-migration.sql`.
4. Confirm the expected rows appear in `dbo.__EFMigrationsHistory`.
5. Stop immediately if any migration statement fails. Do not repeatedly rerun
   or manually alter Production to make the error disappear.

- [ ] Previous package is preserved under `releases`.
- [ ] New package is the only content under `publish`.
- [ ] Reviewed migration script completed, or deployment was classified code
      only.

Start the published app using the process-scoped Production launch block in
[Database environments](database-environments.md).

Read the startup log before opening the application. It must report:

```text
Starting BudgetApp.Server in Production, configured for SQL Server <server> and database BudgetAppDb
```

If it names any other environment or database, stop immediately.

## Phase 7: Smoke Test

Do read-only checks first:

- [ ] `Invoke-RestMethod "https://localhost/api/health"` succeeds.
- [ ] Startup logs report `Production` and `BudgetAppDb`.
- [ ] Login succeeds.
- [ ] Dashboard loads.
- [ ] Existing household, accounts, categories, and budgets appear.
- [ ] Transaction search loads and totals look plausible.
- [ ] The feature changed by this deployment loads and behaves as expected.
- [ ] No unexpected error or fatal log entry appears.
- [ ] Refreshing the page and restarting the app preserve access to the same
      data.

Only after the read-only checks pass:

- [ ] Perform one small, reversible write relevant to the release if needed.
- [ ] Confirm that write is displayed correctly after refresh.
- [ ] Confirm the browser-installed app still opens the intended Production URL.

Record the deployment as successful. Keep the previous code package and
pre-deployment backup.

## Rollback Decision

Rollback is required when the app cannot start, a migration fails, smoke tests
expose incorrect behavior, or data integrity is uncertain.

First stop BudgetApp and prevent further user activity.

### Code-only rollback

Use this when no Production database change occurred:

1. Stop the failed app.
2. Rename the failed `publish` folder to a unique `publish-failed-...` folder.
3. Move the preserved previous package back to
   `C:\Apps\BudgetApp\publish`.
4. Start BudgetApp with the normal Production launch block.
5. Repeat the smoke tests.
6. Record the rollback and failed commit.

Do not overwrite or delete either package until the cause is understood.

### Code and database rollback

Use this when the database changed and the old application is not compatible
with the new schema.

1. Stop BudgetApp and all Production activity.
2. Determine whether any valid data was entered after the pre-deployment backup.
3. If post-deployment data exists, stop and plan how to preserve it. Restoring
   the backup will erase those later changes.
4. Preserve the failed package and return the previous package to `publish`.
5. In SSMS, restore the exact pre-deployment `.bak` to `BudgetAppDb` using the
   manual restore procedure, explicitly confirming the Production destination.
6. Start the previous application revision.
7. Confirm startup reports `Production` and `BudgetAppDb`.
8. Repeat the smoke tests and reconcile important data.
9. Record both the code and database rollback.

Restoring Production is intentionally a manual, confirmed operation. Do not
automate `WITH REPLACE` as part of an ordinary deployment script.

### Prefer a forward fix when appropriate

If users have entered valid data after deployment, a forward-compatible fix may
be safer than restoring an older backup. Do not improvise either approach.
Preserve the current database, create another verified backup, diagnose using
Development or Scratch, and choose deliberately.

## Completion

- [ ] Deployment record is complete.
- [ ] New commit, previous commit/package, and backup filename are recorded.
- [ ] Production smoke tests pass.
- [ ] No secrets or sensitive data were added to Git.
- [ ] Previous package is retained.
- [ ] Pre-deployment backup is retained.
- [ ] Production-derived Scratch data is deleted and Scratch is recreated when
      the rehearsal is complete.

## Related Documentation

- [Initial local Production installation](local-production-installation.md)
- [Manual Production database backup and restore](database-backup-restore.md)
- [Database environments](database-environments.md)
- [Clean development machine setup](development-setup.md)
- [Technical logging](logging.md)
