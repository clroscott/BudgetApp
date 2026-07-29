import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react'
import { flushSync } from 'react-dom'
import { getErrorMessages } from '../auth/errorMessages'
import { useAuth } from '../auth/useAuth'
import { ErrorSummary } from '../components/ErrorSummary'
import { AppIcon } from '../components/AppIcon'
import {
  getDashboardLayout,
  resetDashboardLayout,
  saveDashboardLayout,
  type DashboardLayout,
} from '../dashboard/dashboardLayoutApi'
import { useHouseholds } from '../households/useHouseholds'
import { AppLink } from '../routing/AppLink'
import {
  dashboardPanels,
  defaultDashboardPanelKeys,
} from '../routing/pageRegistry'

const panelByKey = new Map(dashboardPanels.map(panel => [panel.key, panel]))

function withClientDefaults(layout: DashboardLayout): DashboardLayout {
  return {
    ...layout,
    visiblePanelKeys: layout.isDefault
      ? defaultDashboardPanelKeys
      : layout.visiblePanelKeys.filter(key => panelByKey.has(key)),
  }
}

export function DashboardPage() {
  const { user } = useAuth()
  const { currentHousehold } = useHouseholds()
  const [layout, setLayout] = useState<DashboardLayout | null>(null)
  const [draftPanelKeys, setDraftPanelKeys] = useState<string[]>([])
  const [draftColumnCount, setDraftColumnCount] = useState(3)
  const [draggedPanelKey, setDraggedPanelKey] = useState<string | null>(null)
  const [isCustomizing, setIsCustomizing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const panelElements = useRef(new Map<string, HTMLElement>())
  const lastDragReorder = useRef<{
    x: number
    y: number
    occurredAt: number
  } | null>(null)

  useEffect(() => {
    if (!currentHousehold) return
    let cancelled = false
    setIsLoading(true)
    setErrors([])
    void getDashboardLayout(currentHousehold.id)
      .then(result => {
        if (cancelled) return
        const normalized = withClientDefaults(result)
        setLayout(normalized)
        setDraftPanelKeys(normalized.visiblePanelKeys)
        setDraftColumnCount(normalized.preferredColumnCount)
      })
      .catch(error => {
        if (!cancelled) setErrors(getErrorMessages(error))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => { cancelled = true }
  }, [currentHousehold])

  const hiddenPanels = useMemo(
    () => dashboardPanels.filter(panel => !draftPanelKeys.includes(panel.key)),
    [draftPanelKeys],
  )

  if (!user || !currentHousehold) return null

  const beginCustomizing = () => {
    if (layout) {
      setDraftPanelKeys(layout.visiblePanelKeys)
      setDraftColumnCount(layout.preferredColumnCount)
    }
    setErrors([])
    setIsCustomizing(true)
  }

  const cancelCustomizing = () => {
    if (layout) {
      setDraftPanelKeys(layout.visiblePanelKeys)
      setDraftColumnCount(layout.preferredColumnCount)
    }
    setDraggedPanelKey(null)
    setIsCustomizing(false)
  }

  const save = async () => {
    setIsSaving(true)
    setErrors([])
    try {
      const saved = await saveDashboardLayout(currentHousehold.id, {
        preferredColumnCount: draftColumnCount,
        visiblePanelKeys: draftPanelKeys,
      })
      setLayout(saved)
      setDraftPanelKeys(saved.visiblePanelKeys)
      setDraftColumnCount(saved.preferredColumnCount)
      setIsCustomizing(false)
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      setIsSaving(false)
    }
  }

  const reset = async () => {
    setIsSaving(true)
    setErrors([])
    try {
      const defaults = withClientDefaults(
        await resetDashboardLayout(currentHousehold.id))
      setLayout(defaults)
      setDraftPanelKeys(defaults.visiblePanelKeys)
      setDraftColumnCount(defaults.preferredColumnCount)
      setIsCustomizing(false)
    } catch (error) {
      setErrors(getErrorMessages(error))
    } finally {
      setIsSaving(false)
    }
  }

  const animatePanelLayoutChange = (
    updateLayout: () => void,
    duration = 220,
  ) => {
    const previousPositions = new Map(
      [...panelElements.current].map(([key, element]) => [
        key,
        element.getBoundingClientRect(),
      ]),
    )
    flushSync(updateLayout)
    requestAnimationFrame(() => {
      for (const [key, element] of panelElements.current) {
        const previous = previousPositions.get(key)
        if (!previous) continue
        const current = element.getBoundingClientRect()
        const horizontalChange = previous.left - current.left
        const verticalChange = previous.top - current.top
        if (horizontalChange === 0 && verticalChange === 0) continue
        element.animate(
          [
            { transform: `translate(${horizontalChange}px, ${verticalChange}px)` },
            { transform: 'translate(0, 0)' },
          ],
          { duration, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
        )
      }
    })
  }

  const movePanel = (movingKey: string, targetKey: string) => {
    if (movingKey === targetKey) return
    animatePanelLayoutChange(() => {
      setDraftPanelKeys(current => {
        const movingIndex = current.indexOf(movingKey)
        const targetIndex = current.indexOf(targetKey)
        if (movingIndex < 0 || targetIndex < 0) return current
        const next = [...current]
        next.splice(movingIndex, 1)
        next.splice(targetIndex, 0, movingKey)
        return next
      })
    }, 180)
  }

  const changeColumnCount = (count: number) => {
    if (count === draftColumnCount) return
    animatePanelLayoutChange(() => {
      setDraftColumnCount(count)
    }, 280)
  }

  const dropPanel = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    lastDragReorder.current = null
    setDraggedPanelKey(null)
  }

  const previewPanelMove = (
    event: DragEvent<HTMLElement>,
    targetKey: string,
  ) => {
    event.preventDefault()
    if (!draggedPanelKey || draggedPanelKey === targetKey) return

    const bounds = event.currentTarget.getBoundingClientRect()
    const horizontalInset = Math.min(48, bounds.width * 0.2)
    const verticalInset = Math.min(36, bounds.height * 0.2)
    const isInsideDropZone =
      event.clientX >= bounds.left + horizontalInset &&
      event.clientX <= bounds.right - horizontalInset &&
      event.clientY >= bounds.top + verticalInset &&
      event.clientY <= bounds.bottom - verticalInset
    if (!isInsideDropZone) return

    const previous = lastDragReorder.current
    const pointerTravel = previous
      ? Math.hypot(event.clientX - previous.x, event.clientY - previous.y)
      : Number.POSITIVE_INFINITY
    const elapsed = previous ? Date.now() - previous.occurredAt : Number.POSITIVE_INFINITY
    if (pointerTravel < 28 || elapsed < 200) return

    lastDragReorder.current = {
      x: event.clientX,
      y: event.clientY,
      occurredAt: Date.now(),
    }
    movePanel(draggedPanelKey, targetKey)
  }

  const visibleKeys = isCustomizing
    ? draftPanelKeys
    : layout?.visiblePanelKeys ?? []
  const columnCount = isCustomizing
    ? draftColumnCount
    : layout?.preferredColumnCount ?? 3

  return (
    <main className="dashboard-page">
      <section className="dashboard-content">
        <div className="dashboard-title-row">
          <div>
            <p className="eyebrow">Dashboard</p>
            <h1>Hello, {user.displayName}</h1>
            <p className="dashboard-intro">
              Keep your most useful BudgetApp shortcuts within easy reach.
            </p>
          </div>
          {!isLoading && !isCustomizing && (
            <button
              className="secondary-button"
              type="button"
              onClick={beginCustomizing}
            >
              Customize dashboard
            </button>
          )}
        </div>

        <ErrorSummary errors={errors} />

        {isCustomizing && (
          <section className="dashboard-customizer" aria-label="Dashboard settings">
            <div>
              <h2>Customize dashboard</h2>
              <p>Drag shortcuts into order, remove them, or add hidden shortcuts.</p>
            </div>
            <fieldset>
              <legend>Desktop columns</legend>
              {[2, 3, 4].map(count => (
                <button
                  className={draftColumnCount === count ? 'selected' : undefined}
                  key={count}
                  type="button"
                  aria-pressed={draftColumnCount === count}
                  onClick={() => changeColumnCount(count)}
                >
                  {count}
                </button>
              ))}
            </fieldset>
            <div className="dashboard-customizer-actions">
              <button
                className="text-button"
                type="button"
                disabled={isSaving}
                onClick={() => void reset()}
              >
                Reset to default
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={isSaving}
                onClick={cancelCustomizing}
              >
                Cancel
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={isSaving}
                onClick={() => void save()}
              >
                {isSaving ? 'Saving...' : 'Save layout'}
              </button>
            </div>
          </section>
        )}

        {isLoading ? (
          <p className="empty-state">Loading your dashboard...</p>
        ) : visibleKeys.length === 0 ? (
          <section className="dashboard-empty">
            <h2>Your dashboard is empty</h2>
            <p>Add shortcuts below to build a dashboard that works for you.</p>
          </section>
        ) : (
          <div
            className={`dashboard-grid dashboard-columns-${columnCount}${isCustomizing ? ' dashboard-customizing' : ''}`}
          >
            {visibleKeys.map((key, index) => {
              const panel = panelByKey.get(key)
              if (!panel) return null
              const title = key === 'household'
                ? currentHousehold.name
                : panel.title
              const description = key === 'household'
                ? `${currentHousehold.defaultCurrency} / ${currentHousehold.role}`
                : panel.description
              return (
                <article
                  className={`summary-card dashboard-panel${draggedPanelKey === key ? ' dragging' : ''}`}
                  draggable={isCustomizing}
                  key={key}
                  ref={element => {
                    if (element) panelElements.current.set(key, element)
                    else panelElements.current.delete(key)
                  }}
                  onDragStart={event => {
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData('text/plain', panel.label)
                    lastDragReorder.current = null
                    setDraggedPanelKey(key)
                  }}
                  onDragEnd={() => {
                    lastDragReorder.current = null
                    setDraggedPanelKey(null)
                  }}
                  onDragOver={event => previewPanelMove(event, key)}
                  onDrop={dropPanel}
                >
                  {isCustomizing && (
                    <div className="dashboard-panel-controls">
                      <span title="Drag to reorder">Drag</span>
                      <div>
                        <button
                          className="text-button"
                          type="button"
                          disabled={index === 0}
                          aria-label={`Move ${panel.label} earlier`}
                          onClick={() => movePanel(
                            key,
                            draftPanelKeys[index - 1] ?? key,
                          )}
                        >
                          Earlier
                        </button>
                        <button
                          className="text-button"
                          type="button"
                          disabled={index === draftPanelKeys.length - 1}
                          aria-label={`Move ${panel.label} later`}
                          onClick={() => movePanel(
                            key,
                            draftPanelKeys[index + 1] ?? key,
                          )}
                        >
                          Later
                        </button>
                        <button
                          className="text-button danger-text"
                          type="button"
                          onClick={() => setDraftPanelKeys(
                            current => current.filter(item => item !== key),
                          )}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="dashboard-panel-heading">
                    <span className="dashboard-panel-icon">
                      <AppIcon name={panel.icon} />
                    </span>
                    <span>{panel.label}</span>
                  </div>
                  <strong>{title}</strong>
                  <small>{description}</small>
                  {panel.links.map(link => (
                    <AppLink key={link.to} to={link.to}>{link.label}</AppLink>
                  ))}
                </article>
              )
            })}
          </div>
        )}

        {isCustomizing && (
          <section className="dashboard-add-panels">
            <h2>Add shortcuts</h2>
            {hiddenPanels.length === 0 ? (
              <p>Every available shortcut is already on your dashboard.</p>
            ) : (
              <div>
                {hiddenPanels.map(panel => (
                  <button
                    className="secondary-button"
                    type="button"
                    key={panel.key}
                    onClick={() => setDraftPanelKeys(current => [...current, panel.key])}
                  >
                    + {panel.label}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
      </section>
    </main>
  )
}
