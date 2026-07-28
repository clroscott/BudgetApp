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
import { BrandLockup } from '../components/Brand'
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
import { useHouseholds } from '../households/useHouseholds'
import { AppLink } from '../routing/AppLink'

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
  const [isLoading, setIsLoading] = useState(true)
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

  const loadCategories = useCallback(async (showLoadingState = true) => {
    if (!currentHousehold) {
      return
    }

    if (showLoadingState) setIsLoading(true)
    setErrors([])
    try {
      setCategories(await getCategories(currentHousehold.id))
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      if (showLoadingState) setIsLoading(false)
    }
  }, [currentHousehold])

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

  const performChange = async (change: () => Promise<unknown>): Promise<boolean> => {
    setIsSaving(true)
    setErrors([])
    try {
      await change()
      await loadCategories(false)
      return true
    } catch (error) {
      setErrors(getErrorMessages(error))
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const handleCreateRoot = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const succeeded = await performChange(() => createCategory(currentHousehold.id, {
      name: String(data.get('name') ?? ''),
      type: String(data.get('type') ?? 'Expense') as CategoryType,
    }))
    if (succeeded) {
      form.reset()
    }
  }

  const handleCreateSubcategory = async (parentId: string) => {
    const succeeded = await performChange(() => createCategory(currentHousehold.id, {
      name: subcategoryName,
      parentCategoryId: parentId,
    }))
    if (succeeded) {
      setAddingToId(null)
      setSubcategoryName('')
    }
  }

  const handleRename = async (categoryId: string) => {
    const succeeded = await performChange(() => updateCategory(
      currentHousehold.id,
      categoryId,
      editingName,
    ))
    if (succeeded) {
      setEditingId(null)
      setEditingName('')
    }
  }

  const saveOrder = async (
    siblings: CategoryItem[],
    draggedId: string,
    targetId: string,
    position: DropPosition,
  ) => {
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
      setCategories(previousCategories)
      setErrors(getErrorMessages(error))
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
              draggable={!isSaving}
              disabled={isSaving}
              aria-label={`Drag ${category.name} to reorder`}
              title="Drag to reorder. Use Alt+Up or Alt+Down with the keyboard."
              onDragStart={event => handleDragStart(event, category.id)}
              onDragEnd={finishDragging}
              onKeyDown={event => void handleReorderKey(event, siblings, category.id)}
            >⠿</button>
          )}
          <div className="category-name-block">
            {editingId === category.id ? (
              <div className="inline-edit">
                <input
                  aria-label={`Rename ${category.name}`}
                  value={editingName}
                  maxLength={100}
                  onChange={event => setEditingName(event.target.value)}
                />
                <button
                  type="button"
                  disabled={isSaving || !editingName.trim()}
                  onClick={() => void handleRename(category.id)}
                >Save</button>
                <button className="text-button" type="button" onClick={() => setEditingId(null)}>
                  Cancel
                </button>
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
              disabled={isSaving}
              onClick={() => {
                setEditingId(category.id)
                setEditingName(category.name)
              }}
            >Rename</button>
            {!isChild && category.isActive && (
              <button
                className="text-button"
                type="button"
                disabled={isSaving}
                onClick={() => {
                  setAddingToId(category.id)
                  setSubcategoryName('')
                }}
              >Add subcategory</button>
            )}
            <button
              className="text-button"
              type="button"
              disabled={isSaving || (category.isActive && activeChildCount > 0)}
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
    <main className="management-page">
      <header className="app-header">
        <BrandLockup />
        <AppLink className="header-link" to="/dashboard">Dashboard</AppLink>
      </header>

      <section className="management-content">
        <div className="page-title-row">
          <div>
            <p className="eyebrow">Settings</p>
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

        <ErrorSummary errors={errors} />

        {canManage && (
          <form className="add-category-form" onSubmit={(event) => void handleCreateRoot(event)}>
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
            <button className="primary-button" type="submit" disabled={isSaving}>
              Add category
            </button>
          </form>
        )}

        {isLoading ? (
          <p className="empty-state">Loading categories...</p>
        ) : visibleCategories.length === 0 ? (
          <div className="empty-state">
            <h2>No categories to show</h2>
            <p>Add a category or show deactivated categories.</p>
          </div>
        ) : (
          <div className="category-sections">
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
                        <div className="inline-add-subcategory">
                          <input
                            aria-label={`New subcategory under ${root.name}`}
                            value={subcategoryName}
                            maxLength={100}
                            onChange={event => setSubcategoryName(event.target.value)}
                          />
                          <button
                            type="button"
                            disabled={isSaving || !subcategoryName.trim()}
                            onClick={() => void handleCreateSubcategory(root.id)}
                          >Add</button>
                          <button className="text-button" type="button" onClick={() => setAddingToId(null)}>
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
        )}
      </section>
    </main>
  )
}
