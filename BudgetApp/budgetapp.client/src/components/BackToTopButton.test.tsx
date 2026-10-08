import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RouterProvider } from '../routing/RouterProvider'
import { BackToTopButton } from './BackToTopButton'

function Page({ host = false, hidden = false }: { host?: boolean, hidden?: boolean }) {
  return <RouterProvider>
    <BackToTopButton />
    {host && <section hidden={hidden}><span data-back-to-top-host /></section>}
  </RouterProvider>
}

beforeEach(() => vi.stubGlobal('scrollY', 600))
afterEach(() => vi.unstubAllGlobals())

describe('Back to top placement', () => {
  it('moves into an action bar that mounts after the page has loaded', async () => {
    const view = render(<Page />)
    expect((await screen.findByRole('button', { name: 'Back to top' })).closest('[data-back-to-top-host]')).toBeNull()
    view.rerender(<Page host />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back to top' }).closest('[data-back-to-top-host]')).not.toBeNull())
    expect(screen.getAllByRole('button', { name: 'Back to top' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Back to top' }))
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
  })

  it('returns to floating placement when its host is removed', async () => {
    const view = render(<Page host />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back to top' }).closest('[data-back-to-top-host]')).not.toBeNull())
    view.rerender(<Page />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back to top' }).closest('[data-back-to-top-host]')).toBeNull())
  })

  it('does not portal into a hidden action bar and reacts when it becomes visible', async () => {
    const view = render(<Page host hidden />)
    expect((await screen.findByRole('button', { name: 'Back to top' })).closest('[data-back-to-top-host]')).toBeNull()
    view.rerender(<Page host />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back to top' }).closest('[data-back-to-top-host]')).not.toBeNull())
  })

  it('stays hidden near the top even after a host is added', async () => {
    vi.stubGlobal('scrollY', 0)
    const view = render(<Page />)
    view.rerender(<Page host />)
    expect(screen.queryByRole('button', { name: 'Back to top' })).toBeNull()
    vi.stubGlobal('scrollY', 600)
    fireEvent.scroll(window)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Back to top' }).closest('[data-back-to-top-host]')).not.toBeNull())
  })
})
