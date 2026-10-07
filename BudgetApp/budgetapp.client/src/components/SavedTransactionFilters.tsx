import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { getErrorMessages } from '../auth/errorMessages'
import { useUnsavedChangesGuard } from '../routing/useUnsavedChangesGuard'
import { checkSavedFilter, deleteFilter, getSavedFilters, renameFilter, saveFilter,
  type SavedTransactionFilter } from '../transactions/savedFilterApi'
import { filterIntentKey, storedFilterIntent, type TransactionFilters } from '../transactions/transactionFilters'
import { ErrorSummary } from './ErrorSummary'

interface Props {
  householdId: string
  appliedFilters: TransactionFilters
  pendingFilterChanges: boolean
  disabled: boolean
  needsCorrection?: boolean
  onApply: (filters: TransactionFilters, apply: boolean) => boolean
}
export function SavedTransactionFilters({ householdId, appliedFilters, pendingFilterChanges, disabled, needsCorrection, onApply }: Props) {
  const [items, setItems] = useState<SavedTransactionFilter[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [newName, setNewName] = useState('')
  const [renameName, setRenameName] = useState('')
  const [renameBaseline, setRenameBaseline] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [generation, setGeneration] = useState(0)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const [recovery, setRecovery] = useState<string[]>([])
  const alive = useRef(true)
  const creation = useRef<{ key: string, id: string } | null>(null)
  const applyButton = useRef<HTMLButtonElement>(null)
  const returnApplyFocus = useRef(false)
  const renameDraft = useRef({ name: renameName, baseline: renameBaseline, selectedId })
  useLayoutEffect(() => { renameDraft.current = { name: renameName, baseline: renameBaseline, selectedId } },
    [renameName, renameBaseline, selectedId])
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    let current = true
    setLoading(true)
    setLoadFailed(false)
    void getSavedFilters(householdId).then(result => {
      if (!current) return
      setItems(result)
      setErrors([])
      const draft = renameDraft.current
      const refreshed = result.find(item => item.id === draft.selectedId)
      if (draft.name === draft.baseline) {
        setRenameName(refreshed?.name ?? '')
        setRenameBaseline(refreshed?.name ?? '')
        if (!refreshed) setSelectedId('')
      } else if (!refreshed) {
        setNewName(current => current || draft.name)
        setRenameName('')
        setRenameBaseline('')
        setSelectedId('')
        setStatus('The selected preset was removed elsewhere. Its edited name was kept as a new preset name.')
      }
    }).catch(error => {
      if (!current) return
      setLoadFailed(true)
      setErrors(getErrorMessages(error))
    }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [householdId, generation])

  const selected = items.find(item => item.id === selectedId)
  const renameDirty = selected !== undefined && renameName !== renameBaseline
  const confirmDiscard = useUnsavedChangesGuard(newName.trim() !== '' || renameDirty,
    'Leave without saving the saved-filter name changes?')
  const matching = items.find(item => filterIntentKey(item.filters) === filterIntentKey(appliedFilters))
  const blocked = disabled || busy || loading || loadFailed
  useEffect(() => {
    if (blocked || !returnApplyFocus.current) return
    returnApplyFocus.current = false
    // Disabling the pressed button during an async search can drop focus to body.
    // Restore only lost focus; never pull it back from another control.
    if (document.activeElement === document.body || document.activeElement === applyButton.current)
      applyButton.current?.focus({ preventScroll: true })
  }, [blocked, status])
  const upsert = (item: SavedTransactionFilter) => setItems(current =>
    [...current.filter(existing => existing.id !== item.id), item].sort((a, b) => a.name.localeCompare(b.name)))

  const run = async (action: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    setErrors([])
    setStatus('')
    try { await action() }
    catch (error) { if (alive.current) setErrors(getErrorMessages(error)) }
    finally { if (alive.current) setBusy(false) }
  }
  const create = (event: FormEvent) => {
    event.preventDefault()
    if (blocked || pendingFilterChanges || !newName.trim()) return
    const filters = storedFilterIntent(appliedFilters)
    const name = newName.trim()
    const key = JSON.stringify({ name, filters })
    if (creation.current?.key !== key) creation.current = { key, id: crypto.randomUUID() }
    const id = creation.current.id
    void run(async () => {
      const item = await saveFilter(householdId, id, name, filters)
      if (!alive.current) return
      upsert(item)
      setSelectedId(item.id)
      setRenameName(item.name)
      setRenameBaseline(item.name)
      setNewName('')
      creation.current = null
      setStatus('Filter saved. No transactions were changed.')
    })
  }
  const apply = (event: MouseEvent<HTMLButtonElement>) => {
    if (!selected || blocked) return
    returnApplyFocus.current = document.activeElement === applyButton.current || event.detail === 0
    void run(async () => {
      // Check current membership/reference visibility again instead of trusting a cached list.
      const fresh = await checkSavedFilter(householdId, selected.id)
      if (!alive.current) return
      const available = fresh.unavailableReferences.length === 0
      if (!onApply(fresh.filters, available)) return
      upsert(fresh)
      setRenameName(fresh.name)
      setRenameBaseline(fresh.name)
      setRecovery(fresh.unavailableReferences)
      setStatus(available ? `Applied ${fresh.name}. No transactions were changed.`
        : 'Preset not applied. Its choices are shown below for correction; the current results have not changed. Correct the unavailable choices, apply filters, then save a new preset if desired.')
    })
  }
  const rename = (event: FormEvent) => {
    event.preventDefault()
    if (!selected || blocked || !renameName.trim()) return
    void run(async () => {
      const item = await renameFilter(householdId, selected, renameName.trim())
      if (!alive.current) return
      upsert(item)
      setRenameName(item.name)
      setRenameBaseline(item.name)
      setStatus('Filter renamed.')
    })
  }
  const remove = () => {
    if (!selected || blocked || !window.confirm(`Delete the saved filter “${selected.name}”? Transactions and the currently applied filters will not change.`)) return
    void run(async () => {
      await deleteFilter(householdId, selected)
      if (!alive.current) return
      setItems(current => current.filter(item => item.id !== selected.id))
      setSelectedId('')
      setRenameName('')
      setRenameBaseline('')
      setStatus('Saved filter deleted. The current results are unchanged.')
    })
  }
  return <section className="saved-transaction-filters" aria-labelledby="saved-filters-title" aria-busy={busy || loading}>
    <div className="saved-filters-heading">
      <h2 id="saved-filters-title">Saved filters</h2>
      <span>{matching ? `Active preset: ${matching.name}` : 'Custom filters'}</span>
    </div>
    <p className="muted-text">Private to your account in this household. Presets only change what you see.</p>
    <ErrorSummary errors={errors} />
    {loading ? <p role="status">Loading saved filters...</p> : loadFailed ? <div>
      <p>Could not refresh saved filters.{items.length > 0 && ' Previously loaded presets may be out of date.'}</p>
      <button type="button" className="secondary-button" onClick={() => setGeneration(current => current + 1)}>Retry saved filters</button>
    </div> : <>
      {items.length === 0 ? <p>No saved filters yet.</p> : <div className="saved-filter-controls">
        <label><span>Saved filter</span><select value={selectedId} disabled={busy} onChange={event => {
          if (renameDirty && !confirmDiscard()) return
          const item = items.find(value => value.id === event.target.value)
          setSelectedId(event.target.value)
          setRenameName(item?.name ?? '')
          setRenameBaseline(item?.name ?? '')
          setRecovery([])
          setStatus('')
        }}><option value="">Choose a preset</option>
          {items.map(item => <option value={item.id} key={item.id}>{item.name}{item.unavailableReferences.length ? ' (needs attention)' : ''}</option>)}
        </select></label>
        <button ref={applyButton} type="button" className="secondary-button" disabled={blocked || !selected} onClick={apply}>
          {busy ? 'Working...' : 'Apply saved filter'}
        </button>
      </div>}
      <details className="saved-filter-management">
        <summary>Save or manage presets</summary>
        <p>Save the applied filters, including account, dates, category, description, currency, budget inclusion and spending-only choices. Past X days stays rolling; specific dates and months stay fixed.</p>
        {pendingFilterChanges && <p role="status">Apply your filter changes before saving a preset.</p>}
        <form onSubmit={create} className="saved-filter-controls">
          <label><span>New preset name</span><input maxLength={100} required value={newName} disabled={busy}
            onChange={event => setNewName(event.target.value)} /></label>
          <button type="submit" className="secondary-button" disabled={blocked || pendingFilterChanges || !newName.trim()}>Save applied filters</button>
        </form>
        {selected && <form onSubmit={rename} className="saved-filter-controls">
          <label><span>Rename selected preset</span><input maxLength={100} required value={renameName} disabled={busy}
            onChange={event => setRenameName(event.target.value)} /></label>
          <button type="submit" className="secondary-button" disabled={blocked || !renameDirty || !renameName.trim()}>Rename preset</button>
          <button type="button" className="danger-button" disabled={blocked} onClick={remove}>Delete preset</button>
        </form>}
        <button type="button" className="text-button" disabled={busy || loading} onClick={() => setGeneration(current => current + 1)}>Reload saved filters</button>
      </details>
    </>}
    {recovery.length > 0 && needsCorrection !== false && <ul>{recovery.map(issue => <li key={issue}>{issue}</li>)}</ul>}
    {status && (recovery.length === 0 || needsCorrection !== false) && <p role="status">{status}</p>}
  </section>
}
