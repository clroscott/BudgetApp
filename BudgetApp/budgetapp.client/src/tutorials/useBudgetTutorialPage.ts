import { useContext, useLayoutEffect, useState } from 'react'
import { BudgetTutorialPageContext, budgetTutorialKey, type BudgetTutorialPage } from './budgetTutorialState'
import { TutorialContext } from './tutorialContext'
import { recurringTutorialKey } from './recurringTutorialState'

export function useBudgetTutorialPage(page: BudgetTutorialPage | null) {
  const publish = useContext(BudgetTutorialPageContext)
  const tutorialKey = useContext(TutorialContext)?.activeTutorial?.key
  const active = [budgetTutorialKey, recurringTutorialKey, 'budget-lifecycle', 'budget-from-annual-targets'].includes(tutorialKey ?? '')
  const [owner] = useState(() => Symbol('budget tutorial page'))
  const key = JSON.stringify(active ? page : null)
  useLayoutEffect(() => { publish?.(owner, JSON.parse(key) as BudgetTutorialPage | null) }, [publish, owner, key])
  useLayoutEffect(() => () => publish?.(owner, null), [publish, owner])
  return active
}
