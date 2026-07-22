import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { getErrorMessages } from '../auth/errorMessages'
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

  const canManage = currentHousehold?.role !== 'Viewer'

  const loadCategories = useCallback(async () => {
    if (!currentHousehold) {
      return
    }

    setIsLoading(true)
    setErrors([])
    try {
      setCategories(await getCategories(currentHousehold.id))
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      setIsLoading(false)
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
      await loadCategories()
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

  const move = async (
    siblings: CategoryItem[],
    categoryId: string,
    offset: -1 | 1,
  ) => {
    const currentIndex = siblings.findIndex(category => category.id === categoryId)
    const nextIndex = currentIndex + offset
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= siblings.length) {
      return
    }

    const orderedIds = siblings.map(category => category.id)
    ;[orderedIds[currentIndex], orderedIds[nextIndex]] =
      [orderedIds[nextIndex], orderedIds[currentIndex]]
    await performChange(() => reorderCategories(currentHousehold.id, orderedIds))
  }

  const renderRow = (
    category: CategoryItem,
    siblings: CategoryItem[],
    isChild: boolean,
  ) => {
    const activeChildCount = category.children.filter(child => child.isActive).length
    const index = siblings.findIndex(sibling => sibling.id === category.id)

    return (
      <div
        className={`category-row${isChild ? ' subcategory-row' : ''}${category.isActive ? '' : ' inactive-row'}`}
        key={category.id}
      >
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

        {canManage && editingId !== category.id && (
          <div className="category-actions">
            <button
              className="icon-button"
              type="button"
              aria-label={`Move ${category.name} up`}
              disabled={isSaving || index === 0}
              onClick={() => void move(siblings, category.id, -1)}
            >↑</button>
            <button
              className="icon-button"
              type="button"
              aria-label={`Move ${category.name} down`}
              disabled={isSaving || index === siblings.length - 1}
              onClick={() => void move(siblings, category.id, 1)}
            >↓</button>
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
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">B</span>
          <span>BudgetApp</span>
        </div>
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
