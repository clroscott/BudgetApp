import { describe, expect, it } from 'vitest'
import { importTutorialGate, importTutorialRoute, type ImportTutorialPage } from './importTutorialState'
import { importTutorialDefinition } from './importTutorialDefinition'

const task = { householdId: 'home-a', accountId: 'account-a', importId: 'file-a' }
const upload: Extract<ImportTutorialPage, { page: 'upload' }> = { page: 'upload', householdId: 'home-a', accountId: 'account-a',
  canImport: true, loaded: true, fileType: 'csv', busy: false, stagedId: null }
const review: Extract<ImportTutorialPage, { page: 'review' }> = { page: 'review', householdId: 'home-a', importId: 'file-a',
  canEdit: true, fresh: true, busy: false, dirty: false, status: 'ReadyForReview', pendingRows: 1, approvedRows: 0, totalRows: 1 }
const gate = (step: number, page: ImportTutorialPage | null) => importTutorialGate(step, task, 'home-a', page)

describe('import tutorial outcome gates', () => {
  it('keeps the main prompts short and leaves the detailed explanations optional', () => {
    for (const step of importTutorialDefinition.steps) {
      expect(step.body.split(/\s+/).length).toBeLessThanOrEqual(50)
      expect(step.details).toBeTruthy()
    }
  })
  it.each([null, 'home-b', undefined])('rejects unavailable/changed household %s before using page observations', household => {
    expect(importTutorialGate(9, task, household ?? undefined, { ...review, status: 'Completed' }).canNext).toBe(false)
  })
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9])('never advances step %s from a missing/busy/wrong-household page', step => {
    expect(gate(step, null).canNext).toBe(false)
    expect(gate(step, { ...review, busy: true }).canNext).toBe(false)
    expect(gate(step, { ...review, householdId: 'other' }).canNext).toBe(false)
  })
  it('requires loaded permitted account and explicit file selection before staging', () => {
    expect(gate(1, { ...upload, loaded: false }).canNext).toBe(false)
    expect(gate(1, { ...upload, canImport: false }).canNext).toBe(false)
    expect(gate(1, upload).nextLabel).toBe('Use this account')
    expect(gate(2, { ...upload, accountId: 'other' }).canNext).toBe(false)
    expect(gate(2, { ...upload, fileType: null }).canNext).toBe(false)
    expect(gate(2, { ...upload, fileType: 'unsupported' }).canNext).toBe(false)
  })
  it.each(['csv', 'xlsx'] as const)('waits for a successful %s staging result, not an upload click', fileType => {
    expect(gate(2, { ...upload, fileType }).canNext).toBe(true)
    expect(gate(3, { ...upload, fileType }).canNext).toBe(false)
    expect(gate(3, { ...upload, fileType, stagedId: 'new-file' }).canNext).toBe(true)
  })
  it.each([4, 5, 6, 7, 8, 9])('rejects stale, dirty, changed or unauthorized review at step %s', step => {
    expect(gate(step, { ...review, fresh: false }).canNext).toBe(false)
    expect(gate(step, { ...review, dirty: true }).canNext).toBe(false)
    expect(gate(step, { ...review, importId: 'other' }).canNext).toBe(false)
    expect(gate(step, { ...review, canEdit: false }).canNext).toBe(false)
  })
  it.each(['Reversed', 'Uploaded', 'Processing', 'Failed'])('does not reopen/approve a %s batch', status => {
    expect(gate(4, { ...review, status }).canNext).toBe(false)
  })
  it('allows no-change reviews, but requires every decision and then a fresh Completed result', () => {
    expect(gate(5, review).canNext).toBe(true)
    expect(gate(6, review).canNext).toBe(true)
    expect(gate(7, review).canNext).toBe(false)
    expect(gate(7, { ...review, pendingRows: 0 }).canNext).toBe(true)
    expect(gate(8, { ...review, pendingRows: 0 }).canNext).toBe(false)
    expect(gate(9, { ...review, status: 'Completed', approvedRows: 0 }).nextLabel).toBe('Finish')
    expect(gate(9, { ...review, status: 'Completed', fresh: false }).canNext).toBe(false)
  })
  it('allows authorized read-only verification of an already-completed batch, not new writes', () => {
    expect(gate(4, { ...review, status: 'Completed', canEdit: false }).nextLabel).toBe('Verify completed import')
    expect(gate(8, { ...review, status: 'Completed' }).canNext).toBe(true)
  })
  it('binds routes by exact selected ID and uses outcome-only steps without automatic task writes', () => {
    expect(importTutorialRoute(3, task)).toBe('/import')
    expect(importTutorialRoute(4, task)).toBe('/imports/review?importId=file-a')
    expect(importTutorialRoute(4, null)).toBe('/imports/review')
    expect(importTutorialDefinition.steps).toHaveLength(10)
    expect(importTutorialDefinition.steps.every(s => s.advance === 'outcome')).toBe(true)
  })
})
