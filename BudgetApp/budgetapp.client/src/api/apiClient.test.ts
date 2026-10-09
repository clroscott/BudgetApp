import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiGet } from './apiClient'

afterEach(() => vi.unstubAllGlobals())
describe('read cancellation transport', () => {
  it('passes the read signal and credentials through without fetching an antiforgery token', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ count: 2 }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const controller = new AbortController()
    expect(await apiGet('/api/test-read', controller.signal)).toEqual({ count: 2 })
    expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/test-read', expect.objectContaining({ signal: controller.signal, credentials: 'include' }))
  })
  it('preserves an abort instead of reporting it as a connection failure', async () => {
    const aborted = new DOMException('Obsolete read', 'AbortError')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(aborted))
    const controller = new AbortController()
    controller.abort()
    await expect(apiGet('/api/test-read', controller.signal)).rejects.toBe(aborted)
  })
  it('still reports genuine connection failures and HTTP errors', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('Offline')).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Access denied' }), { status: 403 }))
    vi.stubGlobal('fetch', fetch)
    await expect(apiGet('/api/test-read')).rejects.toThrow('Unable to connect')
    await expect(apiGet('/api/test-read')).rejects.toEqual(new ApiError('Access denied', 403))
  })
})
