import { createContext, useContext, useLayoutEffect, useState } from 'react'
import { TutorialContext } from './tutorialContext'
import type { BudgetMonthOption, BudgetScope } from '../budgets/budgetApi'
export const annualTutorialKey = 'budget-from-annual-targets'
export const lifecycleTutorialKey = 'budget-lifecycle'
export interface AnnualTutorialPage {
  householdId: string; year: number; startMonth: number; scope: BudgetScope; planId: string | null
  fresh: boolean; busy: boolean; dirty: boolean; uncertain: boolean; canManage: boolean; hasCategories: boolean
  selectedPeriods: string[]; replaceDrafts: boolean; budgets: BudgetMonthOption[]
  allocationRevision: number; allocationPeriods: string[]; allocationReplaces: boolean; allocationReplacedCount: number
}
export const AnnualTutorialPageContext = createContext<((owner: symbol, page: AnnualTutorialPage | null) => void) | null>(null)
export function useAnnualTutorialPage(page: AnnualTutorialPage | null) {
  const publish = useContext(AnnualTutorialPageContext)
  const active = [annualTutorialKey, lifecycleTutorialKey].includes(useContext(TutorialContext)?.activeTutorial?.key ?? '')
  const [owner] = useState(() => Symbol('annual plan tutorial'))
  const key = JSON.stringify(active ? page : null)
  useLayoutEffect(() => { publish?.(owner, JSON.parse(key) as AnnualTutorialPage | null) }, [publish, owner, key])
  useLayoutEffect(() => () => publish?.(owner, null), [publish, owner])
  return active
}
