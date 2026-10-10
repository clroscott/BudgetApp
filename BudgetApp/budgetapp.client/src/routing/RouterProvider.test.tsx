import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppLink } from './AppLink'
import { RouterProvider } from './RouterProvider'
import { useRouter } from './useRouter'
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard'
import { useUnsavedForm, useUnsavedNativeForm } from './useUnsavedForm'

function Editor() {
  const [value, setValue] = useState('original')
  const { path, search, hash, navigate } = useRouter()
  const guard = useUnsavedForm(value, 'Discard unsaved editor changes?')
  return <>
    <input aria-label="Value" value={value} onChange={e => setValue(e.target.value)} />
    <span data-testid="path">{path}</span>
    <span data-testid="query">{search}{hash}</span>
    <AppLink to="/first?query=one#first">Query one</AppLink>
    <AppLink to="/first?query=two#second">Query two</AppLink>
    <button onClick={() => navigate('/first?query=replaced', { replace: true })}>Replace query</button>
    <AppLink to="/first">First</AppLink><AppLink to="/second">Second</AppLink>
    <button onClick={() => guard.markClean(value)}>Save</button>
    <button onClick={() => { /* failed save intentionally leaves the baseline intact */ }}>Fail save</button>
    <button onClick={() => navigate(path)}>Same page</button>
  </>
}

function NativeEditor({ name }: { name: string }) {
  const guard = useUnsavedNativeForm(`Discard ${name}?`)
  return <form {...guard.formProps}>
    <input aria-label={name} name="name" defaultValue="" />
    <button type="button" onClick={() => guard.markClean()}>Save {name}</button>
  </form>
}

describe('unsaved form navigation', () => {
  it('publishes accepted query/hash changes without remounting and restores Back/Forward', async () => {
    render(<RouterProvider><Editor /></RouterProvider>)
    const input = screen.getByLabelText('Value')
    fireEvent.click(screen.getByText('Query one'))
    fireEvent.click(screen.getByText('Query two'))
    expect(screen.getByTestId('query').textContent).toBe('?query=two#second')
    const length = window.history.length
    await act(async () => window.history.back())
    await waitFor(() => expect(screen.getByTestId('query').textContent).toBe('?query=one#first'))
    expect(screen.getByLabelText('Value')).toBe(input)
    await act(async () => window.history.forward())
    await waitFor(() => expect(screen.getByTestId('query').textContent).toBe('?query=two#second'))
    fireEvent.click(screen.getByText('Replace query'))
    expect(screen.getByTestId('query').textContent).toBe('?query=replaced')
    expect(window.history.length).toBe(length)
  })
  it('never publishes a canceled query traversal or damages its Forward entry', async () => {
    render(<RouterProvider><Editor /></RouterProvider>)
    fireEvent.click(screen.getByText('Query one'))
    fireEvent.click(screen.getByText('Query two'))
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'Unsaved' } })
    const length = window.history.length
    await act(async () => window.history.back())
    await waitFor(() => expect(window.confirm).toHaveBeenCalledOnce())
    await waitFor(() => expect(window.location.search).toBe('?query=two'))
    expect(screen.getByTestId('query').textContent).toBe('?query=two#second')
    expect((screen.getByLabelText('Value') as HTMLInputElement).value).toBe('Unsaved')
    expect(window.history.length).toBe(length)
    vi.mocked(window.confirm).mockReturnValue(true)
    await act(async () => window.history.back())
    await waitFor(() => expect(screen.getByTestId('query').textContent).toBe('?query=one#first'))
    await act(async () => window.history.forward())
    await waitFor(() => expect(screen.getByTestId('query').textContent).toBe('?query=two#second'))
    expect(window.history.length).toBe(length)
  })
  it('does not warn for untouched forms or navigation to the same URL', () => {
    render(<RouterProvider><Editor /></RouterProvider>)
    fireEvent.click(screen.getByText('First'))
    expect(window.confirm).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'changed' } })
    fireEvent.click(screen.getByText('Same page'))
    expect(window.confirm).not.toHaveBeenCalled()
  })
  it('canceled link navigation preserves the URL, page, and entered values', () => {
    render(<RouterProvider><Editor /></RouterProvider>)
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'changed' } })
    fireEvent.click(screen.getByText('Second'))
    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(window.location.pathname).toBe('/')
    expect(screen.getByTestId('path').textContent).toBe('/')
    expect((screen.getByLabelText('Value') as HTMLInputElement).value).toBe('changed')
    vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.click(screen.getByText('Second'))
    expect(window.location.pathname).toBe('/second')
    expect(window.confirm).toHaveBeenCalledTimes(2)
  })
  it('reverting edits and successful saves clear warnings; failed saves do not', () => {
    render(<RouterProvider><Editor /></RouterProvider>)
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'changed' } })
    fireEvent.click(screen.getByText('Fail save'))
    fireEvent.click(screen.getByText('Second'))
    expect(window.confirm).toHaveBeenCalledTimes(1)
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'original' } })
    fireEvent.click(screen.getByText('First'))
    expect(window.confirm).toHaveBeenCalledTimes(1)
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'saved' } })
    fireEvent.click(screen.getByText('Save'))
    fireEvent.click(screen.getByText('Second'))
    expect(window.confirm).toHaveBeenCalledTimes(1)
  })
  it('prevents refresh/close only while dirty, without a custom confirm dialog', () => {
    render(<RouterProvider><Editor /></RouterProvider>)
    const clean = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(clean)
    expect(clean.defaultPrevented).toBe(false)
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'changed' } })
    const dirty = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirty)
    expect(dirty.defaultPrevented).toBe(true)
    expect(window.confirm).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Save'))
    const saved = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(saved)
    expect(saved.defaultPrevented).toBe(false)
  })
  it('combines simultaneous native form edits into one warning and clears only the saved form', () => {
    render(<RouterProvider><NativeEditor name="Account" /><NativeEditor name="Category" />
      <AppLink to="/dashboard">Leave</AppLink></RouterProvider>)
    expect(window.confirm).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'A' } })
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'C' } })
    fireEvent.click(screen.getByText('Leave'))
    expect(window.confirm).toHaveBeenCalledExactlyOnceWith('Discard Account?\n\nDiscard Category?')
    fireEvent.click(screen.getByText('Save Account'))
    fireEvent.click(screen.getByText('Leave'))
    expect(window.confirm).toHaveBeenLastCalledWith('Discard Category?')
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: '' } })
    fireEvent.click(screen.getByText('Leave'))
    expect(window.confirm).toHaveBeenCalledTimes(2)
    expect(window.location.pathname).toBe('/dashboard')
  })
  it('removes only the unmounted editor registration', () => {
    function Editors() {
      const [showClean, setShowClean] = useState(true)
      useUnsavedChangesGuard(true, 'Dirty page')
      return <>{showClean && <NativeEditor name="Clean" />}
        <button onClick={() => setShowClean(false)}>Unmount clean</button>
        <AppLink to="/dashboard">Leave</AppLink></>
    }
    render(<RouterProvider><Editors /></RouterProvider>)
    fireEvent.click(screen.getByText('Unmount clean'))
    fireEvent.click(screen.getByText('Leave'))
    expect(window.confirm).toHaveBeenCalledExactlyOnceWith('Dirty page')
  })
  it('restores canceled Back without adding history entries or destroying Forward', async () => {
    render(<RouterProvider><Editor /></RouterProvider>)
    fireEvent.click(screen.getByText('First'))
    fireEvent.click(screen.getByText('Second'))
    const length = window.history.length
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'changed' } })
    await act(async () => { window.history.back() })
    await waitFor(() => expect(window.confirm).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(window.location.pathname).toBe('/second'))
    expect(window.history.length).toBe(length)
    expect(screen.getByTestId('path').textContent).toBe('/second')
    vi.mocked(window.confirm).mockReturnValue(true)
    await act(async () => { window.history.back() })
    await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/first'))
    expect(window.confirm).toHaveBeenCalledTimes(2)
    vi.mocked(window.confirm).mockReturnValue(false)
    await act(async () => { window.history.forward() })
    await waitFor(() => expect(window.confirm).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(window.location.pathname).toBe('/first'))
    expect(window.history.length).toBe(length)
    vi.mocked(window.confirm).mockReturnValue(true)
    await act(async () => { window.history.forward() })
    await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/second'))
    expect(window.confirm).toHaveBeenCalledTimes(4)
  })
})
