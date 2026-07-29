import {
  useCallback,
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
import { useHouseholds } from '../households/useHouseholds'

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
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const canManage = currentHousehold?.role !== 'Viewer'

  const load = useCallback(async (showLoading = true) => {
    if (!currentHousehold) return
    if (showLoading) setIsLoading(true)
    setErrors([])
    try {
      const [loadedRules, loadedCategories, loadedAccounts] = await Promise.all([
        getCategorizationRules(currentHousehold.id),
        getCategories(currentHousehold.id),
        getAccounts(currentHousehold.id),
      ])
      setRules(loadedRules)
      setCategories(loadedCategories)
      setAccounts(loadedAccounts.filter(account =>
        account.isActive && account.scope === 'Household'))
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      if (showLoading) setIsLoading(false)
    }
  }, [currentHousehold])

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
        await createCategorizationRule(currentHousehold.id, toRequest())
      }
      resetForm()
      await load(false)
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      setIsSaving(false)
    }
  }

  const startEditing = (rule: CategorizationRuleItem) => {
    const selection = findCategorySelection(categories, rule.targetCategoryId)
    setEditingId(rule.id)
    setForm({
      name: rule.name,
      matchOperator: rule.matchOperator,
      matchValue: rule.matchValue,
      accountId: rule.accountId ?? '',
      ...selection,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const performChange = async (change: () => Promise<unknown>) => {
    setIsSaving(true)
    setErrors([])
    try {
      await change()
      await load(false)
    } catch (error) {
      setErrors(getErrorMessages(error))
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
    if (!sourceId || sourceId === targetId) return

    const orderedIds = rules.map(rule => rule.id)
    orderedIds.splice(orderedIds.indexOf(sourceId), 1)
    orderedIds.splice(orderedIds.indexOf(targetId), 0, sourceId)
    const previousRules = rules
    const byId = new Map(rules.map(rule => [rule.id, rule]))
    setRules(orderedIds.map(id => byId.get(id)!).filter(Boolean))

    try {
      await reorderCategorizationRules(currentHousehold.id, orderedIds)
    } catch (error) {
      setRules(previousRules)
      setErrors(getErrorMessages(error))
    }
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
        onDragOver={event => event.preventDefault()}
        onDrop={event => void handleDrop(event, rule.id)}
      >
        <div className="rule-main">
          {canManage && (
            <button
              className="category-drag-handle"
              type="button"
              draggable={!isSaving}
              disabled={isSaving}
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
            <small>{account ? `Only ${account.name}` : 'All accounts'}</small>
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
    <main className="management-page">
      <section className="management-content">
        <div className="page-title-row">
          <div>
            <p className="eyebrow">Settings</p>
            <h1>Categorization rules</h1>
            <p>Automatically categorize uncategorized imported rows using predictable household rules.</p>
          </div>
        </div>

        <ErrorSummary errors={errors} />

        {canManage && (
          <form className="rule-form" onSubmit={event => void handleSubmit(event)}>
            <div className="rule-form-heading">
              <h2>{editingId ? 'Edit rule' : 'Create rule'}</h2>
              <p>Rules never overwrite a category supplied by the CSV or a manual correction.</p>
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
              <select
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
              <select
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
              <select
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
              <select
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
            <div className="rule-form-actions">
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
                  onClick={resetForm}
                >Cancel</button>
              )}
            </div>
          </form>
        )}

        {isLoading ? (
          <p className="empty-state">Loading categorization rules...</p>
        ) : (
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
      </section>
    </main>
  )
}
