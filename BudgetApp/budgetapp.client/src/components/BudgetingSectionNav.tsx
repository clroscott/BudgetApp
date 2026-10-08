import { sectionPages } from '../routing/navigationGroups'
import { SectionNavigation } from './SectionNavigation'

type BudgetingPage =
  | 'monthly'
  | 'annual-targets'
  | 'annual-overview'
  | 'recurring-expenses'
  | 'categories'

export function BudgetingSectionNav({ current }: { current: BudgetingPage }) {
  const id = current === 'monthly' ? 'monthly-budget' : current
  const currentPath = sectionPages('budgeting').find(page => page.id === id)?.path ?? ''
  return <SectionNavigation section="budgeting" currentPath={currentPath} label="Budgeting pages" />
}
