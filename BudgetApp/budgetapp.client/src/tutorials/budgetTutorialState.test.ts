import { describe, expect, it } from 'vitest'
import { budgetTutorialDefinition } from './budgetTutorialDefinition'
import { budgetTutorialGate as gate, budgetTutorialSteps as S, budgetTutorialStepOverride, type BudgetTutorialPage, type BudgetTutorialTask } from './budgetTutorialState'

const task: BudgetTutorialTask = { householdId: 'hh', role: 'Owner', year: 2026, month: 10, scope: 'Household', budgetId: 'budget' }
const page: BudgetTutorialPage = { householdId: 'hh', year: 2026, month: 10, scope: 'Household', budgetId: 'budget', status: 'Draft',
  fresh: true, canManage: true, canPlan: true, busy: false, dirty: false, uncertain: false, hasEnteredAmounts: true, hasSavedAmounts: true,
  overallDetailed: false, hasBreakdown: true, breakdownDetailed: false, hasSecondCategory: true, hasThirdCategory: true }
const check = (step: number, changes: Partial<BudgetTutorialPage> = {}, selected: BudgetTutorialTask | null = task) =>
  gate(step, selected, 'hh', 'Owner', { ...page, ...changes })

describe('monthly tutorial outcome gates', () => {
  it('uses existing saved plans without forcing writes and requires explicit month confirmation', () => {
    expect(check(0, {}, null).nextLabel).toBe('Use this month')
    expect(check(1).canNext).toBe(true)
    expect(check(S.save).canNext).toBe(true)
    expect(check(1, { budgetId: null }, { ...task, budgetId: undefined }).canNext).toBe(false)
  })
  it.each([
    { fresh: false }, { canManage: false }, { canPlan: false }, { busy: true }, { uncertain: true },
    { year: 2027 }, { month: 11 }, { scope: 'Personal' as const }, { householdId: 'other' }, { budgetId: 'other' }, { status: 'Closed' as const },
  ])('blocks stale/unauthorized/changed context %j', changes => { expect(check(S.save, changes).canNext).toBe(false) })
  it('blocks household and role changes, including a new non-Viewer role', () => {
    expect(gate(2, task, 'other', 'Owner', page).canNext).toBe(false)
    expect(gate(2, task, 'hh', 'Viewer', page).canNext).toBe(false)
    expect(gate(2, task, 'hh', 'Admin', page).canNext).toBe(false)
  })
  it('allows dirty planning but waits for saved nonblank amounts, with zero represented as present', () => {
    expect(check(2, { dirty: true }).canNext).toBe(true)
    expect(check(S.breakdown, { dirty: true }).canNext).toBe(true)
    expect(check(S.second, { dirty: true }).canNext).toBe(true)
    expect(check(S.third, { dirty: true }).canNext).toBe(true)
    expect(check(S.save, { dirty: true }).canNext).toBe(false)
    expect(check(2, { hasEnteredAmounts: false, hasSavedAmounts: false }).canNext).toBe(false)
    expect(check(S.save, { hasSavedAmounts: false }).canNext).toBe(false)
    expect(check(S.save, { hasSavedAmounts: true }).canNext).toBe(true)
  })
  it('makes activation optional, verifies authoritative Active status, and checks the final choice', () => {
    expect(check(S.activate).canNext).toBe(false)
    expect(check(S.activate).canKeepDraft).toBe(true)
    expect(check(S.activate, { dirty: true }).canKeepDraft).toBe(false)
    expect(check(S.activate, { status: 'Active' }).canNext).toBe(true)
    expect(check(S.done, {}, { ...task, finishStatus: 'Draft' }).canNext).toBe(true)
    expect(check(S.done, {}, { ...task, finishStatus: 'Draft' }).nextLabel).toBe('Continue budgeting')
    expect(check(S.done, { status: 'Active' }, { ...task, finishStatus: 'Draft' }).canNext).toBe(false)
    expect(check(S.done, { dirty: true }, { ...task, finishStatus: 'Draft' }).canNext).toBe(false)
    expect(check(S.done, { uncertain: true }, { ...task, finishStatus: 'Draft' }).canNext).toBe(false)
  })
  it('keeps the ten real-page prompts concise and cannot skip required outcomes', () => {
    expect(budgetTutorialDefinition.resumeBehavior).toBe('restart')
    expect(budgetTutorialDefinition.steps).toHaveLength(10)
    for (const step of budgetTutorialDefinition.steps) {
      expect(step.route).toBe('/budgeting')
      expect(step.advance).toBe('outcome')
      expect(step.canSkipWhenUnavailable).not.toBe(true)
      expect(step.body.split(/\s+/).length).toBeLessThan(40)
    }
  })
  it('explains Draft versus Active before the choice, without implying Draft is unsaved or Active is locked', () => {
    const meaning = budgetTutorialDefinition.steps[S.meaning]
    expect(meaning.body).toContain('Draft: saved')
    expect(meaning.body).toContain('Both stay editable')
    expect(meaning.body).toContain('show actual spending')
    expect(meaning.details).toContain('does not create transactions')
    expect(check(S.meaning).nextLabel).toBe('Choose status')
  })
  it('uses actual breakdown availability and modes, with honest fewer-category fallbacks', () => {
    expect(budgetTutorialStepOverride(S.breakdown, page)?.targetId).toBe('budget-tutorial-breakdown-mode')
    expect(budgetTutorialStepOverride(S.breakdown, { ...page, breakdownDetailed: true })?.targetId).toBe('budget-tutorial-breakdown-input')
    expect(budgetTutorialStepOverride(S.breakdown, { ...page, hasBreakdown: false })?.body).toContain('no subcategories')
    expect(budgetTutorialStepOverride(S.overall, { ...page, overallDetailed: true })?.body).toContain('Keep your breakdown')
    expect(budgetTutorialStepOverride(S.third, { ...page, hasThirdCategory: false })?.title).toBe('No more categories to plan')
  })
})
