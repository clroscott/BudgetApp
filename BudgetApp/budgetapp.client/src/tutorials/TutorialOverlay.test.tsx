import { useState, type ReactNode } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TutorialContext, type TutorialContextValue } from './tutorialContext'
import { TutorialOverlay } from './TutorialOverlay'
import { revealTutorialNavigationEvent } from './tutorialTargets'
import { tutorialTargetWaitMs } from './useTutorialTarget'
import { mockTutorialLayout, restoreTutorialLayout } from './tutorialTestSupport'
import type { TutorialDefinition, TutorialKind, TutorialStep } from './tutorialDefinitions'

const readStep: TutorialStep = { title: 'Read this area', body: 'Read without changing data.', route: '/', targetId: 'page-title', advance: 'next' }
const clickStep: TutorialStep = { title: 'Open Accounts', body: 'Visit accounts.', route: '/', targetId: 'nav-accounts', advance: 'click' }
function definition(step = readStep, kind: TutorialKind = 'LearnOnly'): TutorialDefinition {
  return { key: 'sample', version: 1, title: 'Sample', description: 'Sample', estimatedMinutes: 1, kind, steps: [step, { ...readStep, title: 'Second step' }] }
}
function show({ tutorial = definition(), index = 0, children, active = true, error = null, importGuide }: {
  tutorial?: TutorialDefinition, index?: number, children?: ReactNode, active?: boolean, error?: string | null,
  importGuide?: TutorialContextValue['importGuide'],
} = {}) {
  const value: TutorialContextValue = { activeTutorial: active ? tutorial : null, activeStepIndex: index,
    isLoading: false, error, importGuide, progress: [], start: vi.fn(async () => {}), dismiss: vi.fn(async () => {}),
    back: vi.fn(async () => {}), next: vi.fn(async () => {}), exit: vi.fn(async () => {}) }
  const background = children ?? <main><div data-tutorial-id="page-title"><h1>Page title</h1><button>Save settings</button></div><button>Unrelated action</button></main>
  const contents = () => <TutorialContext.Provider value={value}>{background}<TutorialOverlay /></TutorialContext.Provider>
  const result = render(contents())
  return { ...result, value, update: (changes: Partial<TutorialContextValue>) => { Object.assign(value, changes); result.rerender(contents()) } }
}
async function flush() { await act(async () => { await Promise.resolve() }) }
async function timeout() { await act(async () => { vi.advanceTimersByTime(tutorialTargetWaitMs) }) }

beforeEach(() => { vi.useFakeTimers(); mockTutorialLayout() })
afterEach(() => { vi.useRealTimers(); restoreTutorialLayout() })

describe('tutorial target recovery', () => {
  it('starts each chapter at the top of the coach without resetting page scroll', async () => {
    const { update } = show()
    await flush()
    const card = document.querySelector<HTMLElement>('.tutorial-coach-card')!
    card.scrollTop = 100
    const scrolls = vi.mocked(window.scrollTo).mock.calls.length
    update({ activeStepIndex: 1 })
    await flush()
    expect(card.scrollTop).toBe(0)
    expect(vi.mocked(window.scrollTo).mock.calls.length).toBe(scrolls)
  })

  it('permits only the named same-origin blob download, not an outside link with the same ID', async () => {
    show({ tutorial: definition({ ...readStep, readControls: ['transaction-tour-download'] }) })
    await flush()
    const accepted = vi.fn((event: MouseEvent) => event.preventDefault())
    const blocked = vi.fn((event: MouseEvent) => event.preventDefault())
    const blob = document.createElement('a')
    blob.dataset.tutorialId = 'transaction-tour-download'; blob.href = `blob:${window.location.origin}/synthetic`; blob.download = 'synthetic.csv'
    blob.addEventListener('click', accepted); document.body.append(blob)
    const outside = document.createElement('a')
    outside.dataset.tutorialId = 'transaction-tour-download'; outside.href = 'https://example.test/private'; outside.download = 'not-allowed.csv'
    outside.addEventListener('click', blocked); document.body.append(outside)
    await flush()
    fireEvent.click(blob); fireEvent.click(outside)
    expect(accepted).toHaveBeenCalledOnce(); expect(blocked).not.toHaveBeenCalled()
    blob.remove(); outside.remove()
  })

  it('allows only named read controls, not neighboring writes or implicit form submissions', async () => {
    const write = vi.fn(), read = vi.fn()
    show({ tutorial: definition({ ...readStep, readControls: ['safe-year'] }), children: <main>
      <form data-tutorial-id="page-title" onSubmit={event => { event.preventDefault(); write() }}>
        <label>Year<input data-tutorial-id="safe-year" /></label>
        <button onClick={read}>Unlisted read button</button><button onClick={write}>Delete record</button>
      </form>
    </main> })
    await flush()
    expect(screen.getByLabelText('Year').closest('[inert]')).toBeNull()
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2024' } })
    expect(screen.getByRole('button', { name: 'Delete record', hidden: true }).hasAttribute('inert')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Delete record', hidden: true }))
    fireEvent.submit(screen.getByLabelText('Year').closest('form')!)
    expect(write).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled()
  })

  it('keeps the full task ring aligned across the dock height and nested scrolling', async () => {
    const importGuide = { canNext: true, canBack: true, message: '', nextLabel: 'Next',
      choose: vi.fn(), restart: vi.fn(), returnToTask: vi.fn() }
    show({ tutorial: definition(readStep, 'GuidedFinancialTask'), index: 1, importGuide,
      children: <main><div data-testid="scroller"><button data-tutorial-id="page-title" data-top={575} data-height={80}>Task action</button></div><div id="import-tutorial-guide-host" /></main> })
    await flush()
    const target = screen.getByRole('button', { name: 'Task action' })
    const ring = document.querySelector<HTMLElement>('.tutorial-spotlight')!
    expect(ring.style.top).toBe('567px')
    expect(ring.style.height).toBe('96px')
    const scrolls = vi.mocked(target.scrollIntoView).mock.calls.length
    target.dataset.top = '625'
    fireEvent.scroll(screen.getByTestId('scroller'))
    expect(ring.style.top).toBe('617px')
    expect(ring.style.height).toBe('96px')
    target.dataset.top = '350'
    fireEvent.scroll(window)
    expect(ring.style.top).toBe('342px')
    expect(ring.style.height).toBe('96px')
    expect(vi.mocked(target.scrollIntoView).mock.calls.length).toBe(scrolls)
  })

  it('pauses for a page error without dimming it, then restores the same step without an action', async () => {
    const write = vi.fn()
    const importGuide = { canNext: true, canBack: true, message: '', nextLabel: 'Next',
      choose: vi.fn(), restart: vi.fn(), returnToTask: vi.fn() }
    const { value } = show({ tutorial: definition(readStep, 'GuidedFinancialTask'), index: 1, importGuide,
      children: <><div role="alert">Unrelated shell notice</div><main>
        <button data-tutorial-id="page-title" onClick={write}>Task action</button>
        <div role="alert" hidden data-testid="task-error">Please fix the upload.</div>
        <div id="import-tutorial-guide-host" />
      </main></> })
    await flush()
    expect(screen.queryByText('Needs attention')).toBeNull()
    const error = screen.getByTestId('task-error')
    await act(async () => { error.hidden = false })
    expect(screen.getByText('Needs attention')).toBeTruthy()
    expect(document.querySelector('.tutorial-blocker')).toBeNull()
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Show error' }))
    expect(document.activeElement).toBe(error)
    expect(write).not.toHaveBeenCalled()
    expect(value.next).not.toHaveBeenCalled()
    await act(async () => { error.hidden = true })
    expect(screen.queryByText('Needs attention')).toBeNull()
    expect(document.querySelector('.tutorial-blocker')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Second step' })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(false)
    expect(value.next).not.toHaveBeenCalled()
  })

  it.each(['display', 'visibility', 'hidden', 'aria-hidden', 'zero-size', 'inert', 'opacity'])('rejects a %s target, stops waiting, and offers safe recovery', async state => {
    const hidden = state === 'hidden'
    const style = state === 'display' ? { display: 'none' } : state === 'visibility' ? { visibility: 'hidden' as const } : state === 'opacity' ? { opacity: 0 } : undefined
    const { value } = show({ children: <main><div data-tutorial-id="page-title" style={style} hidden={hidden}
      aria-hidden={state === 'aria-hidden' ? true : undefined} inert={state === 'inert' ? true : undefined}
      data-width={state === 'zero-size' ? 0 : 180}><h1>Hidden area</h1></div></main> })
    expect(screen.getByText(/Waiting for/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull()
    await timeout()
    expect(screen.queryByText(/Waiting for/)).toBeNull()
    expect(screen.getByText(/This area is not available/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry target' }))
    expect(screen.getByText(/Waiting for/)).toBeTruthy()
    expect(value.next).not.toHaveBeenCalled()
    await timeout()
    fireEvent.click(screen.getByRole('button', { name: 'Skip step' }))
    expect(value.next).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Exit tutorial' }))
    expect(value.exit).toHaveBeenCalledOnce()
  })

  it('finds delayed/returned targets even after timeout and observes removal and hiding after success', async () => {
    function Background() {
      const [visible, setVisible] = useState(false)
      // Expose fixture changes through a test-held function, not a blocked page button.
      change = setVisible
      return <main>{visible && <div data-tutorial-id="page-title"><h1>Arrived</h1></div>}</main>
    }
    let change: (visible: boolean) => void = () => {}
    show({ children: <Background /> })
    await timeout()
    await act(async () => change(true))
    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy()
    const target = document.querySelector<HTMLElement>('[data-tutorial-id="page-title"]')!
    await act(async () => { target.style.display = 'none' })
    expect(screen.getByText(/Waiting for/)).toBeTruthy()
    await act(async () => { target.style.display = '' })
    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy()
    await act(async () => change(false))
    await timeout()
    expect(screen.getByRole('button', { name: 'Retry target' })).toBeTruthy()
  })

  it('chooses a visible duplicate and clips the spotlight to the viewport', () => {
    show({ children: <><div hidden data-tutorial-id="page-title">Hidden</div><main data-tutorial-id="page-title" data-left={-20} data-top={-10} data-width={300}><h1>Visible</h1></main></> })
    const spotlight = document.querySelector<HTMLElement>('.tutorial-spotlight')!
    expect(spotlight.style.left).toBe('0px')
    expect(spotlight.style.top).toBe('0px')
    expect(spotlight.style.width).toBe('288px')
  })

  it.each(['GuidedSetup', 'GuidedFinancialTask'] as const)('never skips or executes a missing required %s action', async kind => {
    const write = vi.fn()
    const { value } = show({ tutorial: definition({ ...clickStep, targetId: 'save-budget', canSkipWhenUnavailable: true }, kind), children: <button hidden data-tutorial-id="save-budget" onClick={write}>Save budget</button> })
    await timeout()
    expect(screen.queryByRole('button', { name: 'Skip step' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry target' }))
    await timeout()
    expect(write).not.toHaveBeenCalled()
    expect(value.next).not.toHaveBeenCalled()
  })

  it('permits explicitly skippable guided information, but Learn-only cannot operate a write target', async () => {
    const { update, value } = show({ tutorial: definition({ ...readStep, canSkipWhenUnavailable: true }, 'GuidedSetup'), children: <main /> })
    await timeout()
    fireEvent.click(screen.getByRole('button', { name: 'Skip step' }))
    expect(value.next).toHaveBeenCalledOnce()
    update({ activeTutorial: definition({ ...clickStep, targetId: 'save-budget' }) })
    await timeout()
    expect(screen.getByRole('button', { name: 'Retry target' })).toBeTruthy()
  })

  it('does not accept a disabled guided target or unsafe Learn-only navigation', async () => {
    const { update } = show({ tutorial: definition({ ...clickStep, targetId: 'save-budget' }, 'GuidedFinancialTask'), children: <><button disabled data-tutorial-id="save-budget">Save budget</button><a href="https://external.example.test" data-tutorial-id="nav-accounts">External</a></> })
    await timeout()
    expect(screen.queryByRole('button', { name: 'Go to highlighted control' })).toBeNull()
    update({ activeTutorial: definition(clickStep) })
    await timeout()
    expect(screen.getByRole('button', { name: 'Retry target' })).toBeTruthy()
  })

  it('responds to viewport changes even with an unavailable target', async () => {
    show({ children: <main /> })
    await timeout()
    vi.mocked(Object.getOwnPropertyDescriptor(window, 'innerWidth')!.get!).mockReturnValue(320)
    fireEvent.resize(window)
    expect(screen.getByRole('region').style.width).toBe('288px')
  })

  it('does not restart a new wait indefinitely after a ready target is lost', async () => {
    show()
    const target = document.querySelector<HTMLElement>('[data-tutorial-id="page-title"]')!
    await act(async () => { target.hidden = true })
    await timeout()
    await act(async () => { document.body.setAttribute('class', 'unrelated-layout-update') })
    expect(screen.queryByText(/Waiting for/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Retry target' })).toBeTruthy()
    document.body.removeAttribute('class')
  })
})

describe('tutorial keyboard and interaction policy', () => {
  it('focuses the coach and allows Tab/Shift-Tab to reach both coach and navigation target', () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    show({ tutorial: definition(clickStep), children: <main><a href="/accounts" data-tutorial-id="nav-accounts">Accounts</a><button>Unrelated action</button></main> })
    const heading = screen.getByRole('heading', { name: 'Open Accounts' })
    const target = screen.getByRole('link', { name: 'Accounts' })
    expect(document.activeElement).toBe(heading)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.keyDown(heading, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(target)
    fireEvent.keyDown(target, { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Exit tutorial' }))
    // Native focus scrolling must reveal off-screen coach controls at 200% zoom.
    expect(focus).toHaveBeenLastCalledWith()
    fireEvent.click(screen.getByRole('button', { name: 'Go to highlighted control' }))
    expect(document.activeElement).toBe(target)
    expect(target.getAttribute('aria-describedby')).toBe(screen.getByText('Visit accounts.').id)
    expect(screen.getByRole('button', { name: 'Unrelated action' }).closest('[inert]')).toBeTruthy()
  })

  it('blocks unrelated and informational form actions, including newly inserted controls', async () => {
    const write = vi.fn()
    show({ children: <main><div data-tutorial-id="page-title"><h1>Page title</h1><button onClick={write}>Save settings</button></div><button onClick={write}>Unrelated action</button></main> })
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    fireEvent.click(screen.getByRole('button', { name: 'Unrelated action' }))
    expect(write).not.toHaveBeenCalled()
    screen.getByRole('button', { name: 'Unrelated action' }).focus()
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Read this area' }))
    const button = document.createElement('button')
    button.textContent = 'Inserted action'
    button.onclick = write
    await act(async () => { document.querySelector('[data-tutorial-id="page-title"]')!.append(button) })
    expect(button.hasAttribute('inert')).toBe(true)
    fireEvent.click(button)
    expect(write).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Read highlighted area' }))
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Page title' }))
  })

  it('allows the intended guided action only, without recovery performing it', async () => {
    const write = vi.fn()
    const { value } = show({ tutorial: definition({ ...clickStep, targetId: 'save-budget' }, 'GuidedFinancialTask'), children: <main><button data-tutorial-id="save-budget" onClick={write}>Save budget</button><button onClick={write}>Delete budget</button></main> })
    fireEvent.click(screen.getByRole('button', { name: 'Go to highlighted control' }))
    expect(write).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete budget' }))
    expect(write).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Save budget' }))
    await act(async () => { vi.advanceTimersByTime(0) })
    expect(write).toHaveBeenCalledOnce()
    expect(value.next).toHaveBeenCalledOnce()
  })

  it('restores focus and original attributes on Exit, and starts replay/Back at the new coach heading', async () => {
    const { update, value } = show({ active: false, children: <main><button>Start tour</button><div data-tutorial-id="page-title"><h1 aria-describedby="existing-description" tabIndex={0}>Page title</h1></div><button inert>Already blocked</button></main> })
    const source = screen.getByRole('button', { name: 'Start tour' })
    const pageHeading = screen.getByRole('heading', { name: 'Page title' })
    source.focus()
    update({ activeTutorial: definition() })
    fireEvent.click(screen.getByRole('button', { name: 'Read highlighted area' }))
    expect(pageHeading.getAttribute('aria-describedby')).toContain('existing-description')
    update({ activeTutorial: null })
    await flush()
    expect(document.activeElement).toBe(source)
    expect(source.hasAttribute('inert')).toBe(false)
    expect(pageHeading.getAttribute('aria-describedby')).toBe('existing-description')
    expect(pageHeading.getAttribute('tabindex')).toBe('0')
    expect(screen.getByRole('button', { name: 'Already blocked' }).hasAttribute('inert')).toBe(true)
    update({ activeTutorial: definition(), activeStepIndex: 1 })
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Second step' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(value.back).toHaveBeenCalledOnce()
    update({ activeStepIndex: 0 })
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Read this area' }))
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(value.exit).toHaveBeenCalledOnce()
  })

  it('restores focus to the current page when the original launch control has been removed', async () => {
    const { update } = show({ active: false })
    const button = screen.getByRole('button', { name: 'Unrelated action' })
    button.focus()
    update({ activeTutorial: definition() })
    await act(async () => button.remove())
    update({ activeTutorial: null })
    await flush()
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Page title' }))
  })

  it('ignores canceled/modifier navigation and cancels queued advancement on exit', async () => {
    const navigate = vi.fn((event: React.MouseEvent) => event.preventDefault())
    const { value, update } = show({ tutorial: definition(clickStep), children: <a href="/accounts" data-tutorial-id="nav-accounts" onClick={navigate}>Accounts</a> })
    const target = screen.getByRole('link', { name: 'Accounts' })
    fireEvent.click(target)
    await act(async () => { vi.advanceTimersByTime(0) })
    expect(value.next).not.toHaveBeenCalled()
    fireEvent.click(target, { ctrlKey: true })
    await act(async () => { vi.advanceTimersByTime(0) })
    expect(value.next).not.toHaveBeenCalled()
    window.history.replaceState(null, '', '/accounts')
    fireEvent.click(target)
    update({ activeTutorial: null })
    await act(async () => { vi.advanceTimersByTime(0) })
    expect(value.next).not.toHaveBeenCalled()
  })

  it('cancels missing-target timers and queued guided clicks on unmount', async () => {
    const { unmount, value } = show({ tutorial: definition({ ...clickStep, targetId: 'save-budget' }, 'GuidedFinancialTask'), children: <button data-tutorial-id="save-budget">Save budget</button> })
    fireEvent.click(screen.getByRole('button', { name: 'Save budget' }))
    unmount()
    await act(async () => { vi.advanceTimersByTime(tutorialTargetWaitMs) })
    expect(value.next).not.toHaveBeenCalled()
    const missing = show({ children: <main /> })
    missing.unmount()
    await act(async () => { vi.advanceTimersByTime(tutorialTargetWaitMs) })
    expect(missing.value.next).not.toHaveBeenCalled()
  })

  it('advances once after successful navigation and presents progress failures without blocking Exit', async () => {
    const { value } = show({ tutorial: definition(clickStep), error: 'Network unavailable.', children: <a href="/accounts" data-tutorial-id="nav-accounts" onClick={event => { event.preventDefault(); window.history.pushState(null, '', '/accounts') }}>Accounts</a> })
    fireEvent.click(screen.getByRole('link', { name: 'Accounts' }))
    fireEvent.click(screen.getByRole('link', { name: 'Accounts' }))
    await act(async () => { vi.advanceTimersByTime(0) })
    expect(value.next).toHaveBeenCalledOnce()
    expect(screen.getByRole('alert').textContent).toContain('still continue or exit')
    fireEvent.click(screen.getByRole('button', { name: 'Exit tutorial' }))
    expect(value.exit).toHaveBeenCalledOnce()
  })
})

describe('navigation reveal uses visibility, not pixel assumptions', () => {
  it.each([760, 800, 880, 600])('reveals a closed rendered menu at %spx (600 models a zoom-reduced viewport)', async width => {
    vi.mocked(Object.getOwnPropertyDescriptor(window, 'innerWidth')!.get!).mockReturnValue(width)
    function Navigation() {
      const [open, setOpen] = useState(false)
      return <aside><button data-tutorial-id="sidebar-menu" aria-expanded={open} ref={element => {
        if (element) element.addEventListener(revealTutorialNavigationEvent, () => setOpen(true), { once: true })
      }}>Menu</button><nav style={{ display: open ? 'block' : 'none' }}><a href="/accounts" data-tutorial-id="nav-accounts">Accounts</a></nav></aside>
    }
    const { value } = show({ tutorial: definition(clickStep), children: <Navigation /> })
    await flush()
    expect(screen.getByRole('button', { name: 'Menu' }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: 'Go to highlighted control' })).toBeTruthy()
    expect(value.next).not.toHaveBeenCalled()
  })

  it('does not open a hidden desktop menu when a collapsed sidebar link is already visible', () => {
    const reveal = vi.fn()
    localStorage.setItem('budgetapp.sidebar-collapsed.test-user', 'true')
    show({ tutorial: definition(clickStep), children: <aside className="collapsed"><button hidden data-tutorial-id="sidebar-menu" aria-expanded={false} ref={element => { element?.addEventListener(revealTutorialNavigationEvent, reveal) }}>Menu</button><a href="/accounts" title="Accounts" data-tutorial-id="nav-accounts"><span hidden>Accounts</span></a></aside> })
    expect(screen.getByRole('button', { name: 'Go to highlighted control' })).toBeTruthy()
    expect(reveal).not.toHaveBeenCalled()
    expect(localStorage.getItem('budgetapp.sidebar-collapsed.test-user')).toBe('true')
  })
})
