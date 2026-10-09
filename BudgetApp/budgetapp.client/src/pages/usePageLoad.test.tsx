import { StrictMode } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { deferred } from '../test/deferred'
import { usePageLoad } from './usePageLoad'

function Probe({ context, read, apply }: { context: string, read: (signal: AbortSignal) => Promise<string>, apply: (value: string) => void }) {
  const load = usePageLoad(context)
  return <>
    <p>{load.status}</p><p>{load.errors.join(', ')}</p>
    <button onClick={() => void load.run(read, apply)}>Read</button>
    <button onClick={load.invalidate}>Invalidate</button>
    <button onClick={load.markReady}>Use known result</button>
  </>
}
describe('shared read ownership', () => {
  it('aborts obsolete reads but also rejects their results when the reader ignores cancellation', async () => {
    const first = deferred<string>(), second = deferred<string>(), apply = vi.fn()
    const read = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    render(<Probe context="A" read={read} apply={apply} />)
    fireEvent.click(screen.getByText('Read'))
    const signal = read.mock.calls[0][0] as AbortSignal
    fireEvent.click(screen.getByText('Read'))
    expect(signal.aborted).toBe(true)
    await act(async () => second.resolve('newest'))
    await act(async () => first.reject(new Error('Old read failed')))
    expect(apply).toHaveBeenCalledExactlyOnceWith('newest')
    expect(screen.getByText('ready')).toBeTruthy()
    expect(screen.queryByText('Old read failed')).toBeNull()
  })
  it('rejects an old A response even after A → B → A and cleans up on unmount', async () => {
    const old = deferred<string>(), latest = deferred<string>(), apply = vi.fn()
    const read = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise)
    const view = render(<StrictMode><Probe context="A" read={read} apply={apply} /></StrictMode>)
    fireEvent.click(screen.getByText('Read'))
    view.rerender(<StrictMode><Probe context="B" read={read} apply={apply} /></StrictMode>)
    view.rerender(<StrictMode><Probe context="A" read={read} apply={apply} /></StrictMode>)
    await act(async () => old.resolve('obsolete A'))
    expect(apply).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Read'))
    const signal = read.mock.calls[1][0] as AbortSignal
    view.unmount()
    expect(signal.aborted).toBe(true)
    await act(async () => latest.resolve('after unmount'))
    expect(apply).not.toHaveBeenCalled()
  })
  it.each(['Invalidate', 'Use known result'])('%s prevents a pending read from overwriting an intentional state update', async action => {
    const pending = deferred<string>(), apply = vi.fn()
    render(<Probe context="A" read={() => pending.promise} apply={apply} />)
    fireEvent.click(screen.getByText('Read'))
    fireEvent.click(screen.getByText(action))
    await act(async () => pending.resolve('old result'))
    expect(apply).not.toHaveBeenCalled()
    expect(screen.getByText(action === 'Invalidate' ? 'loading' : 'ready')).toBeTruthy()
  })
})
