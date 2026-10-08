import {
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react'
import { flushSync } from 'react-dom'
import { getErrorMessages } from '../auth/errorMessages'
import { useAuth } from '../auth/useAuth'
import { ErrorSummary } from '../components/ErrorSummary'
import { PageLoadFeedback } from '../components/PageLoadFeedback'
import { DashboardLivePanel } from '../components/DashboardLivePanel'
import { usePageLoad } from './usePageLoad'
import { useUnsavedChangesGuard } from '../routing/useUnsavedChangesGuard'
import { dashboardBudgetLink, dashboardPeriod, readDashboardSnapshot, type DashboardSnapshot } from '../dashboard/dashboardSnapshot'
import type { BudgetScope } from '../budgets/budgetApi'
import { LoginVerificationReminder } from '../components/LoginVerificationReminder'
import { AppIcon } from '../components/AppIcon'
import {
  getDashboardLayout,
  resetDashboardLayout,
  saveDashboardLayout,
  type DashboardLayout,
} from '../dashboard/dashboardLayoutApi'
import { useHouseholds } from '../households/useHouseholds'
import { AppLink } from '../routing/AppLink'
import { focusPageElement } from '../routing/pageFocus'
import {
  dashboardPanels,
  defaultDashboardPanelKeys,
} from '../routing/pageRegistry'
import { tutorialByKey } from '../tutorials/tutorialDefinitions'
import { useTutorials } from '../tutorials/useTutorials'

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
  const { dismiss, isLoading: tutorialsLoading, progress, start } = useTutorials()
  const [layout, setLayout] = useState<DashboardLayout | null>(null)
  const [draftPanelKeys, setDraftPanelKeys] = useState<string[]>([])
  const [draftColumnCount, setDraftColumnCount] = useState(3)
  const [draggedPanelKey, setDraggedPanelKey] = useState<string | null>(null)
  const [isCustomizing, setIsCustomizing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [period, setPeriod] = useState(() => dashboardPeriod(currentHousehold?.timeZoneId ?? 'UTC'))
  const [scope, setScope] = useState<BudgetScope>('Household')
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null)
  const layoutLoad = usePageLoad(`${user?.id}/${currentHousehold?.id}/layout`)
  const summaryLoad = usePageLoad(`${user?.id}/${currentHousehold?.id}/${period}/${scope}`)
  const { run: runLayout, markReady: layoutReady } = layoutLoad
  const { run: runSummary } = summaryLoad
  const isDirty = isCustomizing && Boolean(layout) && (draftColumnCount !== layout!.preferredColumnCount ||
    JSON.stringify(draftPanelKeys) !== JSON.stringify(layout!.visiblePanelKeys))
  const confirmDiscard = useUnsavedChangesGuard(isDirty, 'Discard your unsaved dashboard layout changes?')
  const activeContext = useRef('')
  activeContext.current = `${user?.id}/${currentHousehold?.id}`
  const panelElements = useRef(new Map<string, HTMLElement>())
  const requestedPanelFocus = useRef<string | null>(null)
  const addCardsHeading = useRef<HTMLHeadingElement>(null)
  const customizeButton = useRef<HTMLButtonElement>(null)
  const returnToCustomize = useRef(false)
  useLayoutEffect(() => {
    if (!isCustomizing && returnToCustomize.current) {
      returnToCustomize.current = false
      customizeButton.current?.focus()
    }
  }, [isCustomizing])
  useLayoutEffect(() => {
    const key = requestedPanelFocus.current
    if (key === null) return
    requestedPanelFocus.current = null
    const heading = panelElements.current.get(key)?.querySelector<HTMLElement>('h2') ?? addCardsHeading.current
    if (heading) return focusPageElement(heading)
  }, [draftPanelKeys])
  const lastDragReorder = useRef<{
    x: number
    y: number
    occurredAt: number
  } | null>(null)

  const loadLayout = useCallback(async () => {
    if (!currentHousehold) return
    await runLayout(() => getDashboardLayout(currentHousehold.id), result => {
      const normalized = withClientDefaults(result)
      setLayout(normalized)
      setDraftPanelKeys(normalized.visiblePanelKeys)
      setDraftColumnCount(normalized.preferredColumnCount)
    })
  }, [currentHousehold, runLayout])
  const loadSummary = useCallback(async () => {
    if (!currentHousehold) return
    await runSummary(() => readDashboardSnapshot(currentHousehold.id, period, scope), setSnapshot)
  }, [currentHousehold, period, scope, runSummary])
  useEffect(() => { void loadLayout() }, [loadLayout])
  useEffect(() => { void loadSummary() }, [loadSummary])
  useEffect(() => () => { activeContext.current = '' }, [])

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
    if (!confirmDiscard()) return
    if (layout) {
      setDraftPanelKeys(layout.visiblePanelKeys)
      setDraftColumnCount(layout.preferredColumnCount)
    }
    setDraggedPanelKey(null)
    returnToCustomize.current = true
    setIsCustomizing(false)
  }

  const addPanel = (key: string) => {
    if (isSaving) return
    requestedPanelFocus.current = key
    setDraftPanelKeys(current => [...current, key])
  }

  const removePanel = (key: string) => {
    if (isSaving) return
    const index = draftPanelKeys.indexOf(key)
    requestedPanelFocus.current = draftPanelKeys[index + 1] ?? draftPanelKeys[index - 1] ?? ''
    setDraftPanelKeys(current => current.filter(item => item !== key))
  }

  const save = async () => {
    if (isSaving || !layoutLoad.isFresh) return
    const context = activeContext.current
    setIsSaving(true)
    setErrors([])
    try {
      const saved = await saveDashboardLayout(currentHousehold.id, {
        preferredColumnCount: draftColumnCount,
        visiblePanelKeys: draftPanelKeys,
      })
      if (activeContext.current !== context) return
      layoutReady()
      setLayout(saved)
      setDraftPanelKeys(saved.visiblePanelKeys)
      setDraftColumnCount(saved.preferredColumnCount)
      returnToCustomize.current = true
      setIsCustomizing(false)
    } catch (error) {
      if (activeContext.current === context) setErrors(getErrorMessages(error))
    } finally {
      if (activeContext.current === context) setIsSaving(false)
    }
  }

  const reset = async () => {
    if (isSaving || !layoutLoad.isFresh || !confirmDiscard()) return
    const context = activeContext.current
    setIsSaving(true)
    setErrors([])
    try {
      const defaults = withClientDefaults(
        await resetDashboardLayout(currentHousehold.id))
      if (activeContext.current !== context) return
      layoutReady()
      setLayout(defaults)
      setDraftPanelKeys(defaults.visiblePanelKeys)
      setDraftColumnCount(defaults.preferredColumnCount)
      returnToCustomize.current = true
      setIsCustomizing(false)
    } catch (error) {
      if (activeContext.current === context) setErrors(getErrorMessages(error))
    } finally {
      if (activeContext.current === context) setIsSaving(false)
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
    if (isSaving || movingKey === targetKey) return
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
    if (isSaving || !draggedPanelKey || draggedPanelKey === targetKey) return

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
        <div className="dashboard-title-row" data-tutorial-id="dashboard-welcome">
          <div>
            <p className="eyebrow">Dashboard</p>
            <h1>Hello, {user.displayName}</h1>
            <p className="dashboard-intro">
              Your financial overview, things to do, and useful shortcuts in one place.
            </p>
          </div>
          {layoutLoad.isFresh && !isCustomizing && (
            <button
              className="secondary-button"
              type="button"
              ref={customizeButton}
              onClick={beginCustomizing}
            >
              Customize dashboard
            </button>
          )}
        </div>

        <ErrorSummary errors={errors} />
        <div className="dashboard-context-controls" aria-label="Financial summary context">
          <label>Summary month<input type="month" min="0001-01" max="9998-12" value={period}
            onChange={event => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value) && Number(event.target.value.slice(0, 4)) >= 1 && Number(event.target.value.slice(0, 4)) <= 9998) setPeriod(event.target.value) }} /></label>
          <label>Budget scope<select value={scope} onChange={event => setScope(event.target.value as BudgetScope)}><option>Household</option><option>Personal</option></select></label>
          <p>Summaries follow this month and scope. Imports and recent transactions are labeled separately.</p>
        </div>
        <PageLoadFeedback subject="dashboard summary" status={summaryLoad.status} errors={summaryLoad.errors}
          onReload={() => void loadSummary()} disabled={summaryLoad.isPending} />
        {summaryLoad.hasData && snapshot && snapshot.recent.totalCount === 0 && !snapshot.budget.id && currentHousehold.role !== 'Viewer' &&
          <section className="dashboard-getting-started" aria-label="Getting started checklist">
            <div><p className="eyebrow">Getting started</p><h2>Build your starting point</h2><p>Use these steps at your own pace. Nothing is created until you choose to save it.</p></div>
            <ol>
              <li>{snapshot.accounts.some(account => account.isActive) ? '✓ ' : ''}<AppLink to="/accounts">Add a financial account</AppLink></li>
              <li><AppLink to="/import">Import transactions</AppLink>, then <AppLink to="/imports/review">review and approve them</AppLink></li>
              <li><AppLink to={dashboardBudgetLink(period, scope)}>Plan your monthly budget</AppLink></li>
            </ol>
          </section>}
        <LoginVerificationReminder enabled={user.loginVerificationEnabled} />

        {!tutorialsLoading && (() => {
          const tutorial = tutorialByKey.get('getting-started')
          if (!tutorial) return null
          const saved = progress.find(item =>
            item.tutorialKey === tutorial.key &&
            item.tutorialVersion === tutorial.version)
          if (saved?.status === 'Completed' || saved?.status === 'Dismissed') {
            return null
          }
          return (
            <section className="dashboard-tutorial-prompt">
              <div>
                <p className="eyebrow">New to MC Budget?</p>
                <h2>Take the guided tour</h2>
                <p>
                  Learn where accounts, budgets, and transaction imports live.
                  The tour does not create or change financial data.
                </p>
              </div>
              <div>
                <button type="button" onClick={() => void start(
                  tutorial.key,
                  saved?.status === 'InProgress',
                )}>
                  {saved?.status === 'InProgress' ? 'Resume tour' : 'Start tour'}
                </button>
                <button className="text-button" type="button"
                  onClick={() => void dismiss(tutorial.key)}>
                  Explore on my own
                </button>
              </div>
            </section>
          )
        })()}

        {isCustomizing && (
          <section className="dashboard-customizer" aria-label="Dashboard settings">
            <div>
              <h2>Customize dashboard</h2>
              <p>Reorder cards by dragging or using Earlier/Later. Add or remove summaries and shortcuts.</p>
            </div>
            <fieldset>
              <legend>Desktop columns</legend>
              {[2, 3, 4].map(count => (
                <button
                  className={draftColumnCount === count ? 'selected' : undefined}
                  key={count}
                  type="button"
                  disabled={isSaving}
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

        {layoutLoad.status !== 'ready' && <PageLoadFeedback subject="dashboard layout" status={layoutLoad.status} errors={layoutLoad.errors}
          onReload={() => void loadLayout()} disabled={isCustomizing || isSaving || layoutLoad.isPending} />}
        {layoutLoad.hasData && (visibleKeys.length === 0 ? (
          <section className="dashboard-empty">
            <h2>Your dashboard is empty</h2>
            <p>Use Customize dashboard to add summaries or shortcuts.</p>
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
                  draggable={isCustomizing && !isSaving}
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
                          disabled={isSaving || index === 0}
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
                          disabled={isSaving || index === draftPanelKeys.length - 1}
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
                          disabled={isSaving}
                          onClick={() => removePanel(key)}
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
                    {panel.live ? <h2>{panel.label}</h2> : <span>{panel.label}</span>}
                  </div>
                  {panel.live ? <DashboardLivePanel panelKey={key} period={period} scope={scope}
                    snapshot={summaryLoad.hasData ? snapshot : null} canManage={currentHousehold.role !== 'Viewer'} loading={summaryLoad.isPending} /> : <>
                  <h2>{title}</h2>
                  <p className="field-help">{description}</p>
                  {panel.links.map(link => (
                    <AppLink key={link.to} to={link.to}>{link.label}</AppLink>
                  ))}</>}
                </article>
              )
            })}
          </div>
        ))}

        {isCustomizing && (
          <section className="dashboard-add-panels">
            <h2 ref={addCardsHeading}>Add cards</h2>
            {hiddenPanels.length === 0 ? (
              <p>Every available card is already on your dashboard.</p>
            ) : (
              <div>
                {hiddenPanels.map(panel => (
                  <button
                    className="secondary-button"
                    type="button"
                    key={panel.key}
                    disabled={isSaving}
                    onClick={() => addPanel(panel.key)}
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
