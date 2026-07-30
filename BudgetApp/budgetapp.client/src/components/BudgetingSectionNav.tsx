import { AppLink } from '../routing/AppLink'

type BudgetingPage =
  | 'monthly'
  | 'annual-targets'
  | 'annual-overview'
  | 'recurring-expenses'

const links: ReadonlyArray<{
  id: BudgetingPage
  label: string
  to: string
}> = [
  { id: 'monthly', label: 'Monthly Budget', to: '/budgeting' },
  { id: 'annual-targets', label: 'Annual Targets', to: '/budgeting/annual-targets' },
  { id: 'annual-overview', label: 'Annual Overview', to: '/budgeting/annual-overview' },
  {
    id: 'recurring-expenses',
    label: 'Recurring Expenses',
    to: '/budgeting/recurring-expenses',
  },
]

export function BudgetingSectionNav({ current }: { current: BudgetingPage }) {
  return (
    <nav className="budgeting-section-nav" aria-label="Budgeting pages">
      {links.map(link => (
        <AppLink
          className={link.id === current ? 'active' : undefined}
          aria-current={link.id === current ? 'page' : undefined}
          key={link.id}
          to={link.to}
        >
          {link.label}
        </AppLink>
      ))}
    </nav>
  )
}
