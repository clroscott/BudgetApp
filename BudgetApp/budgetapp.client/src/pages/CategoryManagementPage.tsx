import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { getErrorMessages } from '../auth/errorMessages'
import { PageFrame } from '../components/PageFrame'
import {
  createCategory,
  getCategories,
  reorderCategories,
  setCategoryActive,
  updateCategory,
  type CategoryItem,
  type CategoryType,
} from '../categories/categoryApi'
import { ErrorSummary } from '../components/ErrorSummary'
import { BudgetingSectionNav } from '../components/BudgetingSectionNav'
import { useHouseholds } from '../households/useHouseholds'
import { useUnsavedChangesGuard } from '../routing/useUnsavedChangesGuard'
import { useUnsavedNativeForm } from '../routing/useUnsavedForm'
import { ApiError } from '../api/apiClient'
import { PageLoadFeedback } from '../components/PageLoadFeedback'
import { usePageLoad } from './usePageLoad'
import { useSetupTutorialPage } from '../tutorials/setupTutorialState'

const categoryTypes: CategoryType[] = ['Expense', 'Income', 'Transfer']
type DropPosition = 'before' | 'after'

function applySiblingOrder(
  roots: CategoryItem[],
  orderedIds: string[],
): CategoryItem[] {
  const orderedIdSet = new Set(orderedIds)
  const byId = new Map<string, CategoryItem>()
  for (const root of roots) {
    byId.set(root.id, root)
    for (const child of root.children) byId.set(child.id, child)
  }

  let rootOrderIndex = 0
  if (roots.filter(root => orderedIdSet.has(root.id)).length === orderedIds.length) {
    return roots.map(root => orderedIdSet.has(root.id)
      ? byId.get(orderedIds[rootOrderIndex++]) ?? root
      : root)
  }

  return roots.map(root => {
    if (root.children.filter(child => orderedIdSet.has(child.id)).length !== orderedIds.length) {
      return root
    }

    let childOrderIndex = 0
    return {
      ...root,
      children: root.children.map(child => orderedIdSet.has(child.id)
        ? byId.get(orderedIds[childOrderIndex++]) ?? child
        : child),
    }
  })
}

export function CategoryManagementPage() {
  const { currentHousehold } = useHouseholds()
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [showDeactivated, setShowDeactivated] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [addingToId, setAddingToId] = useState<string | null>(null)
  const [subcategoryName, setSubcategoryName] = useState('')
  const [draggedCategoryId, setDraggedCategoryId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{
    categoryId: string
    position: DropPosition
  } | null>(null)

  const canManage = currentHousehold?.role !== 'Viewer'
  const editedCategory = categories.flatMap(root => [root, ...root.children])
    .find(category => category.id === editingId)
  const confirmRenameDiscard = useUnsavedChangesGuard(
    Boolean(editedCategory) && editingName !== editedCategory?.name,
    'Discard your unsaved category name changes?',
  )
  const confirmSubcategoryDiscard = useUnsavedChangesGuard(
    Boolean(addingToId) && subcategoryName !== '', 'Discard the new subcategory details?',
  )
  const createGuard = useUnsavedNativeForm('Discard the new category details you entered?')
  const [uncertain, setUncertain] = useState(false)
  const [needsRead, setNeedsRead] = useState(false)
  const loadState = usePageLoad(`${currentHousehold?.id}/${currentHousehold?.role}`)
  const { run, captureContext } = loadState
  const blocked = isSaving || uncertain || !loadState.isFresh
  const tutorialActive = useSetupTutorialPage(currentHousehold ? {
    page: 'categories', householdId: currentHousehold.id, fresh: loadState.isFresh && !needsRead, busy: isSaving || loadState.isPending,
    dirty: createGuard.isDirty || editingId !== null || addingToId !== null, uncertain, selection: null, accountId: null,
  } : null)

  const loadCategories = useCallback(async () => {
    if (!currentHousehold) {
      return false
    }

    return run(() => getCategories(currentHousehold.id), items => { setCategories(items); setNeedsRead(false) })
  }, [currentHousehold, run])

  useEffect(() => {
    void loadCategories()
  }, [loadCategories])

  const visibleCategories = useMemo(() => categories.map(root => ({
    ...root,
    children: root.children.filter(child => showDeactivated || child.isActive),
  })).filter(root => showDeactivated || root.isActive), [categories, showDeactivated])

  if (!currentHousehold) {
    return null
  }

  const performChange = async <T,>(change: () => Promise<T>, confirmed?: (result: T) => void): Promise<boolean> => {
    if (blocked || !canManage) return false
    const isCurrent = captureContext()
    setIsSaving(true)
    setErrors([])
    try {
      const result = await change()
      if (!isCurrent()) return false
      confirmed?.(result)
      return await loadCategories()
    } catch (error) {
      if (!isCurrent()) return false
      setErrors(getErrorMessages(error))
      if (tutorialActive && !(error instanceof ApiError && [400, 422].includes(error.status))) { setUncertain(true); setNeedsRead(true) }
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const handleCreateRoot = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    await performChange(() => createCategory(currentHousehold.id, {
      name: String(data.get('name') ?? ''),
      type: String(data.get('type') ?? 'Expense') as CategoryType,
    }), () => {
      form.reset()
      createGuard.markClean()
    })
  }

  const handleCreateSubcategory = async (parentId: string) => {
    await performChange(() => createCategory(currentHousehold.id, {
      name: subcategoryName,
      parentCategoryId: parentId,
    }), () => {
      setAddingToId(null)
      setSubcategoryName('')
    })
  }

  const handleRename = async (categoryId: string) => {
    await performChange(() => updateCategory(
      currentHousehold.id,
      categoryId,
      editingName,
    ), () => {
      setEditingId(null)
      setEditingName('')
    })
  }

  const saveOrder = async (
    siblings: CategoryItem[],
    draggedId: string,
    targetId: string,
    position: DropPosition,
  ) => {
    if (blocked || !canManage) return
    const isCurrent = captureContext()
    const orderedIds = siblings.map(category => category.id)
    if (!orderedIds.includes(draggedId) || !orderedIds.includes(targetId) ||
        draggedId === targetId) return

    orderedIds.splice(orderedIds.indexOf(draggedId), 1)
    const targetIndex = orderedIds.indexOf(targetId)
    orderedIds.splice(position === 'after' ? targetIndex + 1 : targetIndex, 0, draggedId)

    const previousCategories = categories
    setCategories(current => applySiblingOrder(current, orderedIds))
    setIsSaving(true)
    setErrors([])
    try {
      await reorderCategories(currentHousehold.id, orderedIds)
    } catch (error) {
      if (!isCurrent()) return
      setCategories(previousCategories)
      setErrors(getErrorMessages(error))
      if (tutorialActive && !(error instanceof ApiError && [400, 422].includes(error.status))) { setUncertain(true); setNeedsRead(true) }
    } finally {
      setIsSaving(false)
    }
  }

  const handleDragStart = (
    event: DragEvent<HTMLButtonElement>,
    categoryId: string,
  ) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', categoryId)
    setDraggedCategoryId(categoryId)
    setDropTarget(null)
  }

  const handleDragOver = (
    event: DragEvent<HTMLDivElement>,
    siblings: CategoryItem[],
    targetId: string,
  ) => {
    if (!draggedCategoryId || draggedCategoryId === targetId ||
        !siblings.some(category => category.id === draggedCategoryId)) return

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const bounds = event.currentTarget.getBoundingClientRect()
    setDropTarget({
      categoryId: targetId,
      position: event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after',
    })
  }

  const finishDragging = () => {
    setDraggedCategoryId(null)
    setDropTarget(null)
  }

  const handleDrop = async (
    event: DragEvent<HTMLDivElement>,
    siblings: CategoryItem[],
    targetId: string,
  ) => {
    event.preventDefault()
    const position = dropTarget?.categoryId === targetId
      ? dropTarget.position
      : 'before'
    const draggedId = draggedCategoryId
    finishDragging()
    if (draggedId) await saveOrder(siblings, draggedId, targetId, position)
  }

  const handleReorderKey = async (
    event: KeyboardEvent<HTMLButtonElement>,
    siblings: CategoryItem[],
    categoryId: string,
  ) => {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
    event.preventDefault()
    const currentIndex = siblings.findIndex(category => category.id === categoryId)
    const targetIndex = currentIndex + (event.key === 'ArrowUp' ? -1 : 1)
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= siblings.length) return
    await saveOrder(
      siblings,
      categoryId,
      siblings[targetIndex].id,
      event.key === 'ArrowUp' ? 'before' : 'after',
    )
  }

  const renderRow = (
    category: CategoryItem,
    siblings: CategoryItem[],
    isChild: boolean,
  ) => {
    const activeChildCount = category.children.filter(child => child.isActive).length
    const dropClass = dropTarget?.categoryId === category.id
      ? ` category-drop-${dropTarget.position}`
      : ''

    return (
      <div
        className={`category-row${isChild ? ' subcategory-row' : ''}${category.isActive ? '' : ' inactive-row'}${draggedCategoryId === category.id ? ' category-row-dragging' : ''}${dropClass}`}
        key={category.id}
        onDragOver={event => handleDragOver(event, siblings, category.id)}
        onDrop={event => void handleDrop(event, siblings, category.id)}
      >
        <div className="category-drag-content">
          {canManage && editingId !== category.id && (
            <button
              className="category-drag-handle"
              type="button"
              draggable={!blocked}
              disabled={blocked}
              aria-label={`Drag ${category.name} to reorder`}
              title="Drag to reorder. Use Alt+Up or Alt+Down with the keyboard."
              onDragStart={event => handleDragStart(event, category.id)}
              onDragEnd={finishDragging}
              onKeyDown={event => void handleReorderKey(event, siblings, category.id)}
            >⠿</button>
          )}
          <div className="category-name-block">
            {editingId === category.id ? (
              <div className="category-rename-editor" data-tutorial-id={!addingToId ? 'setup-tour-category-edit' : undefined}>
                <div className="inline-edit">
                  <input
                    aria-label={`Rename ${category.name}`}
                    value={editingName}
                    maxLength={100}
                    onChange={event => setEditingName(event.target.value)}
                  />
                  <button
                    type="button"
                    disabled={blocked || !editingName.trim()}
                    onClick={() => void handleRename(category.id)}
                  >Rename everywhere</button>
                  <button className="text-button" type="button" onClick={() => {
                    if (confirmRenameDiscard()) setEditingId(null)
                  }}>
                    Cancel
                  </button>
                </div>
                <small>
                  Existing transactions and budgets assigned to this category will show the new name.
                  Imported descriptions and history will not change.
                </small>
              </div>
            ) : (
              <>
                <strong>{category.name}</strong>
                {!category.isActive && <span className="status-pill">Deactivated</span>}
              </>
            )}
          </div>
        </div>

        {canManage && editingId !== category.id && (
          <div className="category-actions">
            <button
              className="text-button"
              type="button"
              disabled={blocked}
              onClick={() => {
                if (!confirmRenameDiscard()) return
                setEditingId(category.id)
                setEditingName(category.name)
              }}
            >Rename</button>
            {!isChild && category.isActive && (
              <button
                className="text-button"
                type="button"
                disabled={blocked}
                onClick={() => {
                  if (addingToId === category.id || !confirmSubcategoryDiscard()) return
                  setAddingToId(category.id)
                  setSubcategoryName('')
                }}
              >Add subcategory</button>
            )}
            <button
              className="text-button"
              type="button"
              disabled={blocked || (category.isActive && activeChildCount > 0)}
              title={category.isActive && activeChildCount > 0
                ? 'Deactivate active subcategories first.'
                : undefined}
              onClick={() => void performChange(() => setCategoryActive(
                currentHousehold.id,
                category.id,
                !category.isActive,
              ))}
            >{category.isActive ? 'Deactivate' : 'Reactivate'}</button>
          </div>
        )}
      </div>
    )
  }

  return (
    <PageFrame footer={<div id="setup-tutorial-guide-host" />}>
        <BudgetingSectionNav current="categories" />
        <div className="page-title-row" data-tutorial-id="setup-tour-categories-title">
          <div>
            <p className="eyebrow">Budgeting</p>
            <h1>Categories</h1>
            <p>Manage the categories shared by {currentHousehold.name}.</p>
          </div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={showDeactivated}
              onChange={event => setShowDeactivated(event.target.checked)}
            />
            <span>Show deactivated</span>
          </label>
        </div>

        {!uncertain && <ErrorSummary errors={errors} />}
        <PageLoadFeedback subject="categories" status={loadState.status} errors={loadState.errors} onReload={() => void loadCategories()} disabled={isSaving} />
        {uncertain && <div className="error-summary" role="alert"><p>The category change may have saved. Check the list before trying again.</p>
          <button type="button" disabled={isSaving || loadState.isPending} onClick={() => { setErrors([]); void loadCategories() }}>Check saved categories</button>
          <button type="button" disabled={needsRead || !loadState.isFresh || isSaving} onClick={() => {
            if (!createGuard.confirmDiscard() || !confirmRenameDiscard() || !confirmSubcategoryDiscard()) return
            const form = document.getElementById('setup-category-create') as HTMLFormElement | null
            form?.reset(); createGuard.markClean(); setEditingId(null); setEditingName(''); setAddingToId(null); setSubcategoryName('')
            setUncertain(false); setErrors([])
          }}>Use the checked saved list</button>
          <p>Inspect the result first. Continuing clears unsaved form details after confirmation; it does not repeat the change.</p></div>}

        {canManage && loadState.hasData && (
          <form {...createGuard.formProps} id="setup-category-create" data-tutorial-id="setup-tour-category-form" className="add-category-form" onSubmit={(event) => void handleCreateRoot(event)}>
            <div>
              <label htmlFor="new-category-name">New root category</label>
              <input id="new-category-name" name="name" maxLength={100} required />
            </div>
            <div>
              <label htmlFor="new-category-type">Type</label>
              <select id="new-category-type" name="type" defaultValue="Expense">
                {categoryTypes.map(type => <option key={type}>{type}</option>)}
              </select>
            </div>
            <button className="primary-button" type="submit" disabled={blocked}>
              Add category
            </button>
          </form>
        )}

        {loadState.hasData && (visibleCategories.length === 0 ? (
          <div className="empty-state" data-tutorial-id="setup-tour-category-empty">
            <h2>No categories to show</h2>
            <p>Add a category or show deactivated categories.</p>
          </div>
        ) : (
          <div className="category-sections" data-tutorial-id="setup-tour-category-list">
            {categoryTypes.map(type => {
              const roots = visibleCategories.filter(category => category.type === type)
              const allRoots = categories.filter(category => category.type === type)
              if (roots.length === 0) {
                return null
              }

              return (
                <section className="category-section" key={type}>
                  <h2>{type}</h2>
                  {roots.map(root => (
                    <div className="category-group" key={root.id}>
                      {renderRow(root, allRoots, false)}
                      {addingToId === root.id && (
                        <div className="inline-add-subcategory" data-tutorial-id="setup-tour-category-edit">
                          <input
                            aria-label={`New subcategory under ${root.name}`}
                            value={subcategoryName}
                            maxLength={100}
                            onChange={event => setSubcategoryName(event.target.value)}
                          />
                          <button
                            type="button"
                            disabled={blocked || !subcategoryName.trim()}
                            onClick={() => void handleCreateSubcategory(root.id)}
                          >Add</button>
                          <button className="text-button" type="button" onClick={() => {
                            if (confirmSubcategoryDiscard()) setAddingToId(null)
                          }}>
                            Cancel
                          </button>
                        </div>
                      )}
                      {root.children.map(child => {
                        const allChildren = categories
                          .find(category => category.id === root.id)?.children ?? root.children
                        return renderRow(child, allChildren, true)
                      })}
                    </div>
                  ))}
                </section>
              )
            })}
          </div>
        ))}
    </PageFrame>
  )
}
