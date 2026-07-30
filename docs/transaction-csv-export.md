# Transaction CSV Export

## Purpose

BudgetApp users can download their visible official transactions in a portable,
human-readable CSV file. The file can be opened in spreadsheet software or a
text editor without SQL Server or BudgetApp.

This supports personal record keeping, independent analysis, accountant
workflows, and migration to another financial tool. It is not a complete
BudgetApp backup and cannot restore an application installation.

## How to Export

On the **Transactions** page, apply the desired filters and select
**Export matching transactions**.

The download is named with its UTC creation time:

```text
budgetapp-transactions-YYYYMMDD-HHMMSSZ.csv
```

The export contains every transaction matching the currently applied search
filters, across all result pages. Changing a filter without selecting
**Apply filters** does not change the visible results or the export.

## Visibility and Authorization

The export uses the same visibility rules as the Transactions page:

- the user must be an active member of the requested household;
- shared household-account transactions are included;
- the signed-in user's personal-account transactions are included;
- another household member's personal-account transactions are excluded;
- membership in one household cannot authorize exporting another household.

An export event is written to the technical log with the user, household, and
exported record count. Transaction contents are not written to that log event.

## Columns

| Column | Meaning |
| --- | --- |
| Transaction Date | Effective transaction date in `YYYY-MM-DD` format |
| Description | Official saved transaction description |
| Amount | Invariant decimal; positive is spending and negative is income, refund, or credit |
| Currency | Three-letter account currency |
| Account | Human-readable account name |
| Category | Top-level category name |
| Subcategory | Child category name, when assigned |
| Budget Treatment | `Included` or `Excluded` from budget calculations |
| Notes | Optional saved notes |

The file deliberately omits internal database IDs, user IDs, account numbers,
passwords, authentication data, secrets, raw uploaded files, and staged import
rows.

## Spreadsheet Safety

Descriptions, account/category names, notes, and other text fields are protected
against spreadsheet formula injection. Text whose first non-whitespace
character is `=`, `+`, `-`, or `@` receives a leading apostrophe before export.

Standard CSV quoting is applied to commas, quotation marks, and line breaks.
The file is UTF-8 with a byte-order mark for compatibility with common Windows
spreadsheet applications.

## Limitations

- The export is not digitally signed or encrypted.
- Anyone who can read the file can read its financial contents.
- Categories, budgets, recurring expenses, household configuration, import
  profiles, and authentication records are not included.
- Importing this CSV does not reconstruct the original BudgetApp relationships.

Store exported CSV files with the same care as bank exports. Do not commit them
to Git or attach them to public issues.

## Related Documentation

- [Manual Production database backup and restore](database-backup-restore.md)
- [Database environments](database-environments.md)
