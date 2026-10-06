import { describe, expect, it } from 'vitest'
import { importProfileTemplateUrl } from './importProfileApi'

describe('CSV profile template URLs', () => {
  it('preserves the route for ordinary household and profile IDs', () => {
    expect(importProfileTemplateUrl('household-a', 'profile-a'))
      .toBe('/api/households/household-a/import-profiles/profile-a/template')
  })

  it.each([
    'profile/other?download=true#fragment',
    'profile"><img src=x onerror=alert(1)>',
    'javascript:alert(1)',
    'profile %2F café',
  ])('keeps the profile ID %s inside one encoded path segment', profileId => {
    const path = importProfileTemplateUrl('household-a', profileId)
    const url = new URL(path, window.location.origin)
    expect(url.origin).toBe(window.location.origin)
    expect(url.search).toBe('')
    expect(url.hash).toBe('')
    expect(url.pathname.split('/')).toHaveLength(7)
    expect(decodeURIComponent(url.pathname.split('/')[5])).toBe(profileId)
    expect(path).not.toContain('<')
    expect(path).not.toContain('"')
  })

  it('also encodes the household ID without changing the template endpoint', () => {
    const householdId = 'household/other?query=true#fragment'
    const url = new URL(importProfileTemplateUrl(householdId, 'profile-a'), window.location.origin)
    expect(url.origin).toBe(window.location.origin)
    expect(url.search).toBe('')
    expect(url.hash).toBe('')
    const segments = url.pathname.split('/')
    expect(segments).toHaveLength(7)
    expect(decodeURIComponent(segments[3])).toBe(householdId)
    expect(segments.slice(4)).toEqual(['import-profiles', 'profile-a', 'template'])
  })
})
