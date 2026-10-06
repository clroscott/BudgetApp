import { describe, expect, it } from 'vitest'
import { createNavigationGuards } from './navigationGuards'

describe('owned navigation registrations', () => {
  it('does not let a clean editor clear another dirty editor', () => {
    const guards = createNavigationGuards()
    const removeDirty = guards.register(() => 'Unsaved budget')
    const removeClean = guards.register(() => null)
    removeClean()
    expect(guards.message()).toBe('Unsaved budget')
    removeDirty()
    expect(guards.message()).toBeNull()
  })
  it('combines distinct messages into one prompt and deduplicates equal messages', () => {
    const guards = createNavigationGuards()
    guards.register(() => 'Unsaved budget')
    guards.register(() => 'Unsaved budget')
    guards.register(() => 'Unsaved rule')
    expect(guards.message()).toBe('Unsaved budget\n\nUnsaved rule')
  })
  it('uses current dirty state rather than the state at registration', () => {
    const guards = createNavigationGuards()
    let dirty = false
    guards.register(() => dirty ? 'Unsaved edit' : null)
    expect(guards.message()).toBeNull()
    dirty = true
    expect(guards.message()).toBe('Unsaved edit')
    dirty = false
    expect(guards.message()).toBeNull()
  })
})
