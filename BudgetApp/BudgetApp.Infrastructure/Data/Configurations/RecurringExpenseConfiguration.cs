using BudgetApp.Domain.Accounts;
using BudgetApp.Domain.Categories;
using BudgetApp.Domain.Households;
using BudgetApp.Domain.RecurringExpenses;
using BudgetApp.Infrastructure.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace BudgetApp.Infrastructure.Data.Configurations;

internal sealed class RecurringExpenseConfiguration : IEntityTypeConfiguration<RecurringExpense>
{
    public void Configure(EntityTypeBuilder<RecurringExpense> builder)
    {
        builder.ToTable("RecurringExpenses", table =>
        {
            table.HasCheckConstraint(
                "CK_RecurringExpenses_Scope_Owner",
                "([Scope] = 'Household' AND [OwnerUserId] IS NULL) OR " +
                "([Scope] = 'Personal' AND [OwnerUserId] IS NOT NULL)");
            table.HasCheckConstraint(
                "CK_RecurringExpenses_Amount",
                "[Amount] > 0");
            table.HasCheckConstraint(
                "CK_RecurringExpenses_ExpectedDayOfMonth",
                "[ExpectedDayOfMonth] IS NULL OR " +
                "([ExpectedDayOfMonth] >= 1 AND [ExpectedDayOfMonth] <= 31)");
            table.HasCheckConstraint(
                "CK_RecurringExpenses_DateRange",
                "[EndsOn] IS NULL OR [EndsOn] >= [StartsOn]");
        });

        builder.HasKey(expense => expense.Id);

        builder.HasIndex(expense => new
        {
            expense.HouseholdId,
            expense.Scope,
            expense.OwnerUserId,
            expense.IsActive
        });

        builder.HasIndex(expense => expense.CategoryId);
        builder.HasIndex(expense => expense.AccountId);

        builder.Property(expense => expense.Scope)
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsUnicode(false)
            .IsRequired();

        builder.Property(expense => expense.Name)
            .HasMaxLength(RecurringExpense.NameMaxLength)
            .IsRequired();

        builder.Property(expense => expense.Amount)
            .HasPrecision(19, 4)
            .IsRequired();

        builder.Property(expense => expense.Currency)
            .HasMaxLength(RecurringExpense.CurrencyCodeLength)
            .IsFixedLength()
            .IsUnicode(false)
            .IsRequired();

        builder.Property(expense => expense.StartsOn)
            .HasColumnType("date")
            .IsRequired();

        builder.Property(expense => expense.EndsOn)
            .HasColumnType("date");

        builder.Property(expense => expense.IsActive)
            .IsRequired();

        builder.Property(expense => expense.CreatedAtUtc)
            .IsRequired();

        builder.Property(expense => expense.UpdatedAtUtc)
            .IsRequired();

        builder.HasOne<Household>()
            .WithMany()
            .HasForeignKey(expense => expense.HouseholdId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne<ApplicationUser>()
            .WithMany()
            .HasForeignKey(expense => expense.OwnerUserId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne<Category>()
            .WithMany()
            .HasForeignKey(expense => expense.CategoryId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne<Account>()
            .WithMany()
            .HasForeignKey(expense => expense.AccountId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
