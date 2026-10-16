import { useContext, useLayoutEffect, useState } from 'react'
import { BudgetTutorialPageContext, budgetTutorialKey, type BudgetTutorialPage } from './budgetTutorialState'
import { TutorialContext } from './tutorialContext'

export function useBudgetTutorialPage(page: BudgetTutorialPage | null) {
  const publish = useContext(BudgetTutorialPageContext)
  const active = useContext(TutorialContext)?.activeTutorial?.key === budgetTutorialKey
  const [owner] = useState(() => Symbol('budget tutorial page'))
  const key = JSON.stringify(page)
  useLayoutEffect(() => { publish?.(owner, JSON.parse(key) as BudgetTutorialPage | null) }, [publish, owner, key])
  useLayoutEffect(() => () => publish?.(owner, null), [publish, owner])
  return active
}
