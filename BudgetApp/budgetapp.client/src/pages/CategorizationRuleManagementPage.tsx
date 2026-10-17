import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type FormEvent,
} from 'react'
import { getAccounts, type AccountItem } from '../accounts/accountApi'
import { getErrorMessages } from '../auth/errorMessages'
import {
  createCategorizationRule,
  deleteCategorizationRule,
  getCategorizationRules,
  reorderCategorizationRules,
  setCategorizationRuleActive,
  updateCategorizationRule,
  type CategorizationRuleItem,
  type CategorizationRuleMatchOperator,
  type SaveCategorizationRuleRequest,
} from '../categorizationRules/categorizationRuleApi'
import { getCategories, type CategoryItem } from '../categories/categoryApi'
import { ErrorSummary } from '../components/ErrorSummary'
import { PageFrame } from '../components/PageFrame'
import { TransactionsSectionNav } from '../components/TransactionsSectionNav'
import { useHouseholds } from '../households/useHouseholds'
import { useUnsavedForm } from '../routing/useUnsavedForm'
import { usePageLoad } from './usePageLoad'
import { PageLoadFeedback } from '../components/PageLoadFeedback'
import { useRuleTutorialPage } from '../tutorials/categorizationTutorialState'
import { TutorialContext } from '../tutorials/tutorialContext'
import { ApiError } from '../api/apiClient'

const operatorOptions: Array<{
  value: CategorizationRuleMatchOperator
  label: string
}> = [
  { value: 'Contains', label: 'contains' },
  { value: 'StartsWith', label: 'starts with' },
  { value: 'EndsWith', label: 'ends with' },
  { value: 'Exact', label: 'exactly matches' },
]

interface RuleForm {
  name: string
  matchOperator: CategorizationRuleMatchOperator
  matchValue: string
  accountId: string
  categoryId: string
  subcategoryId: string
}

const emptyForm: RuleForm = {
  name: '',
  matchOperator: 'Contains',
  matchValue: '',
  accountId: '',
  categoryId: '',
  subcategoryId: '',
}

function findCategorySelection(categories: CategoryItem[], targetId: string) {
  for (const category of categories) {
    if (category.id === targetId) {
      return { categoryId: category.id, subcategoryId: '' }
    }

    if (category.children.some(child => child.id === targetId)) {
      return { categoryId: category.id, subcategoryId: targetId }
    }
  }

  return { categoryId: '', subcategoryId: '' }
}

export function CategorizationRuleManagementPage() {
  const { currentHousehold } = useHouseholds()
  const [rules, setRules] = useState<CategorizationRuleItem[]>([])
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [accounts, setAccounts] = useState<AccountItem[]>([])
  const [form, setForm] = useState<RuleForm>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const formGuard = useUnsavedForm(form, 'Discard your unsaved categorization rule changes?')
  const tutorials = useContext(TutorialContext)
  const [guideSelection, setGuideSelection] = useState<string | null>(() => tutorials?.categorizationGuide?.ruleSelection ?? null)
  const [createdId, setCreatedId] = useState<string | null>(() => tutorials?.categorizationGuide?.ruleSelection === 'new' ? tutorials.categorizationGuide.ruleId ?? null : null)
  const [writeUncertain, setWriteUncertain] = useState(false)
  const [needsRead, setNeedsRead] = useState(false)
  const pageLoad = usePageLoad(`${currentHousehold?.id}/${currentHousehold?.role}`)
  const { run, captureContext } = pageLoad
  const selectedRule = rules.find(rule => rule.isActive && rule.id === (guideSelection === 'new' ? createdId : guideSelection))
  const tutorialActive = useRuleTutorialPage({ householdId: currentHousehold?.id ?? '', fresh: pageLoad.isFresh,
    busy: isSaving || Boolean(draggedId), dirty: formGuard.isDirty, uncertain: writeUncertain,
    selection: guideSelection, ruleId: selectedRule?.id ?? null, canManage: currentHousehold?.role !== 'Viewer',
    editing: editingId !== null || guideSelection === 'new' && !createdId })
  const isLoading = pageLoad.isPending && !pageLoad.hasData

  const canManage = currentHousehold?.role !== 'Viewer'

  const load = useCallback(async () => {
    if (!currentHousehold) return false
    return run(() => Promise.all([
        getCategorizationRules(currentHousehold.id),
        getCategories(currentHousehold.id),
        getAccounts(currentHousehold.id),
      ]), ([loadedRules, loadedCategories, loadedAccounts]) => {
      setRules(loadedRules)
      setCategories(loadedCategories)
      setAccounts(loadedAccounts.filter(account =>
        account.isActive && account.scope === 'Household'))
      setNeedsRead(false)
    })
  }, [currentHousehold, run])

  useEffect(() => {
    void load()
  }, [load])

  const activeCategories = useMemo(
    () => categories
      .filter(category => category.isActive)
      .map(category => ({
        ...category,
        children: category.children.filter(child => child.isActive),
      })),
    [categories],
  )
  const selectedCategory = activeCategories.find(
    category => category.id === form.categoryId,
  )

  if (!currentHousehold) return null

  const resetForm = () => {
    setEditingId(null)
    setForm(emptyForm)
    formGuard.markClean(emptyForm)
  }

  const toRequest = (): SaveCategorizationRuleRequest => ({
    name: form.name,
    matchField: 'Description',
    matchOperator: form.matchOperator,
    matchValue: form.matchValue,
    accountId: form.accountId || null,
    targetCategoryId: form.subcategoryId || form.categoryId,
  })

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSaving || writeUncertain || !pageLoad.isFresh || !canManage || tutorialActive && guideSelection === 'new' && createdId) return
    const stillCurrent = captureContext()
    setIsSaving(true)
    setErrors([])
    try {
      if (editingId) {
        await updateCategorizationRule(
          currentHousehold.id,
          editingId,
          toRequest(),
        )
      } else {
        const result = await createCategorizationRule(currentHousehold.id, toRequest())
        if (!stillCurrent()) return
        if (tutorialActive) { setCreatedId(result.id); setGuideSelection('new') }
      }
      if (!stillCurrent()) return
      resetForm()
      await load()
    } catch (error) {
      if (stillCurrent()) {
        setErrors(getErrorMessages(error))
        if (tutorialActive && !(error instanceof ApiError && [400, 422].includes(error.status))) { setWriteUncertain(true); setNeedsRead(true) }
      }
    } finally {
      setIsSaving(false)
    }
  }

  const startEditing = (rule: CategorizationRuleItem) => {
    if (writeUncertain || !pageLoad.isFresh || editingId === rule.id || !formGuard.confirmDiscard()) return
    if (tutorialActive) setGuideSelection(rule.id)
    const selection = findCategorySelection(categories, rule.targetCategoryId)
    setEditingId(rule.id)
    const next: RuleForm = {
      name: rule.name,
      matchOperator: rule.matchOperator,
      matchValue: rule.matchValue,
      accountId: rule.accountId ?? '',
      ...selection,
    }
    setForm(next)
    formGuard.markClean(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const performChange = async (change: () => Promise<unknown>) => {
    if (isSaving || writeUncertain || !pageLoad.isFresh) return
    const stillCurrent = captureContext()
    setIsSaving(true)
    setErrors([])
    try {
      await change()
      if (stillCurrent()) await load()
    } catch (error) {
      if (stillCurrent()) {
        setErrors(getErrorMessages(error))
        if (tutorialActive) { setWriteUncertain(true); setNeedsRead(true) }
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleDrop = async (
    event: DragEvent<HTMLDivElement>,
    targetId: string,
  ) => {
    event.preventDefault()
    const sourceId = draggedId
    setDraggedId(null)
    if (!sourceId || sourceId === targetId || writeUncertain || !pageLoad.isFresh || isSaving) return
    const stillCurrent = captureContext()

    const orderedIds = rules.map(rule => rule.id)
    orderedIds.splice(orderedIds.indexOf(sourceId), 1)
    orderedIds.splice(orderedIds.indexOf(targetId), 0, sourceId)
    const previousRules = rules
    const byId = new Map(rules.map(rule => [rule.id, rule]))
    setRules(orderedIds.map(id => byId.get(id)!).filter(Boolean))
    setIsSaving(true)

    try {
      await reorderCategorizationRules(currentHousehold.id, orderedIds)
    } catch (error) {
      if (stillCurrent()) {
        setRules(previousRules); setErrors(getErrorMessages(error))
        if (tutorialActive) { setWriteUncertain(true); setNeedsRead(true) }
      }
    } finally { setIsSaving(false) }
  }

  const renderRule = (rule: CategorizationRuleItem) => {
    const account = accounts.find(item => item.id === rule.accountId)
    const selection = findCategorySelection(categories, rule.targetCategoryId)
    const parent = categories.find(item => item.id === selection.categoryId)
    const child = parent?.children.find(item => item.id === selection.subcategoryId)
    const targetLabel = child ? `${parent?.name} / ${child.name}` : parent?.name
    const operatorLabel = operatorOptions.find(
      option => option.value === rule.matchOperator,
    )?.label

    return (
      <div
        className={`rule-row${rule.isActive ? '' : ' inactive-row'}${draggedId === rule.id ? ' rule-row-dragging' : ''}`}
        key={rule.id}
        data-tutorial-id={rule.id === selectedRule?.id ? 'category-tour-selected' : undefined}
        onDragOver={event => event.preventDefault()}
        onDrop={event => void handleDrop(event, rule.id)}
      >
        <div className="rule-main">
          {canManage && (
            <button
              className="category-drag-handle"
              type="button"
              draggable={!isSaving && !writeUncertain && pageLoad.isFresh}
              disabled={isSaving || writeUncertain || !pageLoad.isFresh}
              title="Drag to change rule priority"
              aria-label={`Drag ${rule.name} to reorder`}
              onDragStart={event => {
                event.dataTransfer.effectAllowed = 'move'
                setDraggedId(rule.id)
              }}
              onDragEnd={() => setDraggedId(null)}
            >⠿</button>
          )}
          <div>
            <div className="rule-heading">
              <strong>{rule.name}</strong>
              {!rule.isActive && <span className="status-pill">Inactive</span>}
            </div>
            <p>
              Description {operatorLabel} <code>{rule.matchValue}</code>
              {' → '}
              <strong>{targetLabel ?? 'Unavailable category'}</strong>
            </p>
            <small>{account ? `Only ${account.name}` : rule.accountId ? 'Restricted account (not available in this view)' : 'All accounts'} · Earlier active rules have priority.</small>
          </div>
        </div>
        {canManage && (
          <div className="category-actions">
            <button
              className="text-button"
              type="button"
              disabled={isSaving}
              onClick={() => startEditing(rule)}
            >Edit</button>
            <button
              className="text-button"
              type="button"
              disabled={isSaving}
              onClick={() => void performChange(() =>
                setCategorizationRuleActive(
                  currentHousehold.id,
                  rule.id,
                  !rule.isActive,
                ))}
            >{rule.isActive ? 'Deactivate' : 'Reactivate'}</button>
            <button
              className="text-button danger-text"
              type="button"
              disabled={isSaving}
              onClick={() => {
                if (window.confirm(
                  `Permanently delete the rule "${rule.name}"? This cannot be undone.`,
                )) {
                  void performChange(() =>
                    deleteCategorizationRule(currentHousehold.id, rule.id))
                }
              }}
            >Delete permanently</button>
          </div>
        )}
      </div>
    )
  }

  const activeRules = rules.filter(rule => rule.isActive)
  const inactiveRules = rules.filter(rule => !rule.isActive)

  return (
    <PageFrame footer={<div id="categorization-tutorial-guide-host" />}>
        <TransactionsSectionNav />
        <div className="page-title-row">
          <div>
            <p className="eyebrow">Transactions</p>
            <h1>Categorization rules</h1>
            <p>Automatically categorize uncategorized imported rows using predictable household rules.</p>
          </div>
        </div>

        <ErrorSummary errors={errors} />
        <PageLoadFeedback {...pageLoad} subject="categorization rules" onReload={() => void load()} disabled={isSaving || pageLoad.isPending} />
        {writeUncertain && <section className="error-summary" role="alert">
          <p>Rule change uncertain. Check saved rules before another write; do not create another copy.</p>
          <button type="button" disabled={pageLoad.isPending || isSaving} onClick={() => void load()}>Check saved rules</button>
          {!needsRead && pageLoad.isFresh && <p>Choose the actual saved rule below, or restart with a different existing rule. Do not assume an unchanged form was saved.</p>}
        </section>}
        {tutorialActive && <section className="transaction-filter-panel" data-tutorial-id="category-tour-picker">
          <label><span>Rule to review</span><select value={guideSelection ?? ''} disabled={!pageLoad.isFresh || needsRead || isSaving} onChange={event => {
            if (!formGuard.confirmDiscard()) return
            resetForm(); setGuideSelection(event.target.value || null); setWriteUncertain(false); setErrors([])
          }}>
            <option value="">Choose a rule…</option>
            {canManage && !writeUncertain && <option value="new">{createdId ? 'Use the rule just saved' : 'New rule'}</option>}
            {rules.filter(rule => rule.isActive).map(rule => <option key={rule.id} value={rule.id}>{rule.name}</option>)}
          </select></label>
          <p>Use a correct existing rule without editing. New rules do not recategorize all posted transactions.</p>
        </section>}

        {canManage && pageLoad.hasData && (!tutorialActive || editingId || guideSelection === 'new' && !createdId) && (
          <form className="rule-form" onSubmit={event => void handleSubmit(event)}>
            <fieldset className="rule-form-fields" disabled={isSaving || writeUncertain || !pageLoad.isFresh}>
            <div className="rule-form-heading">
              <h2>{editingId ? 'Edit rule' : 'Create rule'}</h2>
              <p>Automatic import matching keeps supplied categories. In Import review, explicitly choosing Reapply can replace existing category choices.</p>
            </div>
            <label>
              Rule name
              <input
                value={form.name}
                maxLength={100}
                required
                onChange={event => setForm(current => ({
                  ...current,
                  name: event.target.value,
                }))}
              />
            </label>
            <label>
              Imported description
              <select aria-label="Imported description"
                value={form.matchOperator}
                onChange={event => setForm(current => ({
                  ...current,
                  matchOperator: event.target.value as CategorizationRuleMatchOperator,
                }))}
              >
                {operatorOptions.map(option => (
                  <option value={option.value} key={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              Match text
              <input
                value={form.matchValue}
                maxLength={200}
                required
                placeholder="For example, NETFLIX"
                onChange={event => setForm(current => ({
                  ...current,
                  matchValue: event.target.value,
                }))}
              />
            </label>
            <label>
              Account restriction
              <select aria-label="Account restriction"
                value={form.accountId}
                onChange={event => setForm(current => ({
                  ...current,
                  accountId: event.target.value,
                }))}
              >
                <option value="">All accounts</option>
                {accounts.map(account => (
                  <option value={account.id} key={account.id}>{account.name}</option>
                ))}
              </select>
              <small>Account-specific rules currently support shared household accounts.</small>
            </label>
            <label>
              Category
              <select aria-label="Category"
                value={form.categoryId}
                required
                onChange={event => setForm(current => ({
                  ...current,
                  categoryId: event.target.value,
                  subcategoryId: '',
                }))}
              >
                <option value="">Select a category</option>
                {activeCategories.map(category => (
                  <option value={category.id} key={category.id}>
                    {category.name} ({category.type})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Subcategory
              <select aria-label="Subcategory"
                value={form.subcategoryId}
                disabled={!selectedCategory || selectedCategory.children.length === 0}
                onChange={event => setForm(current => ({
                  ...current,
                  subcategoryId: event.target.value,
                }))}
              >
                <option value="">Use the overall category</option>
                {selectedCategory?.children.map(category => (
                  <option value={category.id} key={category.id}>{category.name}</option>
                ))}
              </select>
            </label>
            <div className="rule-form-actions" data-tutorial-id="category-tour-save">
              <button
                className="primary-button"
                type="submit"
                disabled={isSaving || !form.categoryId}
              >{editingId ? 'Save rule' : 'Create rule'}</button>
              {editingId && (
                <button
                  className="secondary-button"
                  type="button"
                  disabled={isSaving}
                  onClick={() => { if (formGuard.confirmDiscard()) resetForm() }}
                >Cancel</button>
              )}
            </div>
            </fieldset>
          </form>
        )}

        {isLoading ? (
          <p className="empty-state">Loading categorization rules...</p>
        ) : pageLoad.hasData && (
          <div className="rule-sections">
            <section className="rule-section">
              <div className="rule-section-heading">
                <div>
                  <p className="eyebrow">Applied during import</p>
                  <h2>Active rules</h2>
                </div>
                <span className="status-pill">{activeRules.length}</span>
              </div>
              {activeRules.length === 0
                ? <p className="empty-state">No active categorization rules.</p>
                : activeRules.map(renderRule)}
            </section>
            <section className="rule-section inactive-rule-section">
              <div className="rule-section-heading">
                <div>
                  <p className="eyebrow">Not currently applied</p>
                  <h2>Inactive rules</h2>
                </div>
                <span className="status-pill">{inactiveRules.length}</span>
              </div>
              {inactiveRules.length === 0
                ? <p className="empty-state">No inactive categorization rules.</p>
                : inactiveRules.map(renderRule)}
            </section>
          </div>
        )}
    </PageFrame>
  )
}
