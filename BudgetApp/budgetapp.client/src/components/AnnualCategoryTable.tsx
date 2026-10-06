import { useId, type CSSProperties } from 'react'
import type { AnnualBudgetCategory } from '../budgets/annualBudgetOverviewApi'
import type { BudgetScope } from '../budgets/budgetApi'
import { transactionLink } from '../budgets/transactionDrilldown'
import { AppLink } from '../routing/AppLink'

const measures = [
  { id: 'budgeted', label: 'Budgeted' },
  { id: 'actual', label: 'Actual' },
  { id: 'remaining', label: 'Remaining' },
  { id: 'average', label: 'Average actual per month' },
] as const

interface TableContext {
  prefix: string
  year: number
  scope: BudgetScope
  currency: string
  householdId: string
  formatAmount: (amount: number) => string
}

export function AnnualCategoryTable({ categories, ...context }: Omit<TableContext, 'prefix'> & {
  categories: AnnualBudgetCategory[]
}) {
  const prefix = useId()
  return <div className="annual-category-table" role="region" aria-label="Category performance table"
    aria-describedby={`${prefix}-scroll-help`} tabIndex={0}>
    <p id={`${prefix}-scroll-help`} className="annual-category-scroll-hint">
      On narrow screens, scroll sideways to see every column. Keyboard users can focus this area and use the arrow keys.
    </p>
    <table>
      <caption>{context.scope} category performance — {context.year}, {context.currency}</caption>
      <colgroup><col className="annual-category-name-column" />{measures.map(measure => <col key={measure.id} />)}</colgroup>
      <thead><tr className="annual-category-header">
        <th scope="col" id={`${prefix}-category`}>Category</th>
        {measures.map(measure => <th scope="col" id={`${prefix}-${measure.id}`} key={measure.id}>{measure.label}</th>)}
      </tr></thead>
      {categories.map(category => <tbody className="annual-category-group" key={category.id}>
        <CategoryRows category={category} context={{ ...context, prefix }} />
      </tbody>)}
    </table>
  </div>
}

function CategoryRows({ category, context, ancestors = [] }: {
  category: AnnualBudgetCategory
  context: TableContext
  ancestors?: string[]
}) {
  const rowId = `${context.prefix}-row-${encodeURIComponent(category.id)}`
  const headerFor = (measure: typeof measures[number]['id']) => `${rowId} ${context.prefix}-${measure}`
  const isChild = ancestors.length > 0
  return <>
    <tr className={`annual-category-row ${isChild ? 'annual-category-child' : 'annual-category-parent'}`}>
      <th scope="row" id={rowId} headers={`${context.prefix}-category`}>
        <span className="annual-category-name" style={{ '--category-depth': ancestors.length } as CSSProperties}>
          <AppLink to={transactionLink(context.year, context.scope, context.currency, category.id, undefined, context.householdId)}>{category.name}</AppLink>
          {isChild && <small>Subcategory of {ancestors.join(' / ')}</small>}
          {!isChild && category.children.length > 0 && <small>Includes subcategories</small>}
          {!category.isActive && <small>Deactivated</small>}
        </span>
      </th>
      <td headers={headerFor('budgeted')}>
        <strong>{category.budgetedAmount === null ? 'No budget' : context.formatAmount(category.budgetedAmount)}</strong>
        {category.budgetedAmount === 0 && <small>Zero budget</small>}
      </td>
      <td headers={headerFor('actual')}>
        <strong>{context.formatAmount(category.actualAmount)}</strong>
        {category.actualAmount < 0 && <small>Negative amount</small>}
      </td>
      <td headers={headerFor('remaining')} className={category.remainingAmount !== null && category.remainingAmount < 0 ? 'budget-over' : undefined}>
        <strong>{category.remainingAmount === null ? 'Not available — no budget' : context.formatAmount(category.remainingAmount)}</strong>
        {category.remainingAmount !== null && category.remainingAmount < 0 && <small>Over budget</small>}
      </td>
      <td headers={headerFor('average')}>
        <strong>{context.formatAmount(category.averageActualPerMonth)}</strong>
        {category.averageActualPerMonth < 0 && <small>Negative amount</small>}
      </td>
    </tr>
    {category.children.map(child => <CategoryRows key={child.id} category={child} context={context} ancestors={[...ancestors, category.name]} />)}
  </>
}
