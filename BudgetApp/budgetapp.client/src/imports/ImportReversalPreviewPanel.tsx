import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { PageLoadFeedback } from '../components/PageLoadFeedback'
import { ErrorSummary } from '../components/ErrorSummary'
import { getErrorMessages } from '../auth/errorMessages'
import { ApiError } from '../api/apiClient'
import { usePageLoad } from '../pages/usePageLoad'
import { getImportReversalPreview, reverseImport, type ImportReversalPreview, type ReverseImportResult } from './importApi'
import { useRecoveryPreviewPage } from '../tutorials/importRecoveryTutorialState'

interface Props {
  householdId: string
  importId: string
  onBusyChange: (busy: boolean) => void
  onReversed: (result: ReverseImportResult) => void
}
export function ImportReversalPreviewPanel(props: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const id = useId()
  return <div className="import-reversal-preview" data-tutorial-id="import-undo-preview">
    <button type="button" className="secondary-button" aria-expanded={open} aria-controls={id} disabled={busy}
      onClick={() => setOpen(value => !value)}>{open ? 'Close undo preview' : 'Preview undo'}</button>
    <div id={id} hidden={!open}>
      {open && <PreviewDetails {...props} onBusyChange={value => { setBusy(value); props.onBusyChange(value) }} />}
    </div>
  </div>
}

function PreviewDetails({ householdId, importId, onBusyChange, onReversed }: Props) {
  const [page, setPage] = useState(1)
  const pending = useRef(false)
  const [busy, setBusy] = useState(false)
  const [needsReload, setNeedsReload] = useState(false)
  const [writeErrors, setWriteErrors] = useState<string[]>([])
  const [preview, setPreview] = useState<ImportReversalPreview | null>(null)
  const state = usePageLoad(`${householdId}/${importId}/${page}`)
  const { run } = state
  useRecoveryPreviewPage({ householdId, importId, fresh: state.isFresh && Boolean(preview), busy,
    uncertain: needsReload, canReverse: preview?.canReverse ?? false })
  const load = useCallback(() => run(signal => getImportReversalPreview(householdId, importId, page, signal), value => {
    setPreview(value); setNeedsReload(false); setWriteErrors([])
    if (value.status === 'Reversed') onReversed({ importFileId: value.importFileId, status: value.status,
      reversedTransactionCount: value.linkedTransactionCount, updatedAtUtc: value.importUpdatedAtUtc, alreadyReversed: true })
  }),
    [run, householdId, importId, page, onReversed])
  useEffect(() => { void load() }, [load])
  const undo = async () => {
    if (pending.current || !state.isFresh || needsReload || !preview?.canReverse) return
    if (!window.confirm(`Undo all ${preview.linkedTransactionCount} transactions from “${preview.originalFileName}” in ${preview.accountName}?\n\nThey will be voided and removed from active totals. The original import, transactions and audit history will be retained. There is no partial undo.`)) return
    const stillCurrent = state.captureContext()
    pending.current = true; setBusy(true); onBusyChange(true)
    try {
      const result = await reverseImport(householdId, importId, preview.previewVersion)
      if (stillCurrent()) {
        setPreview(current => current ? { ...current, status: 'Reversed', canReverse: false } : current)
        onReversed(result)
      }
    } catch (error) {
      if (stillCurrent()) {
        setWriteErrors([...getErrorMessages(error), 'Refresh the undo preview to check the saved status before trying again.'])
        setNeedsReload(true)
        if (error instanceof ApiError && [401, 403, 404].includes(error.status)) setPreview(null)
      }
    } finally {
      pending.current = false
      if (stillCurrent()) { setBusy(false); onBusyChange(false) }
    }
  }
  const headingId = useId()
  const money = preview ? new Intl.NumberFormat(undefined, { style: 'currency', currency: preview.currency,
    minimumFractionDigits: 2, maximumFractionDigits: 4 }) : null
  return <section className="import-reversal-details" aria-labelledby={headingId} data-tutorial-id="import-undo-controls">
    <h3 id={headingId}>Undo preview</h3>
    <p>Checking this preview changes nothing. Undo voids the whole batch and keeps its history.</p>
    <ErrorSummary errors={writeErrors} revealOnChange />
    <PageLoadFeedback subject="undo preview" status={state.status} errors={state.errors}
      disabled={state.isPending || busy} onReload={() => void load()} />
    {state.hasData && preview && <>
      <p><strong>{preview.originalFileName}</strong> · {preview.accountName} · {preview.currency}
        {preview.sourceWorksheetName && <> · Worksheet: {preview.sourceWorksheetName}</>}</p>
      <p>{preview.linkedTransactionCount} linked transactions · {preview.eligibleRowCount} eligible rows · {preview.blockedRowCount} blocked rows</p>
      {state.isFresh && <p className={preview.canReverse ? 'field-help' : 'import-reversal-warning'} role="status">
        {preview.status === 'Reversed' ? 'This import has already been undone. Its history is retained.' : preview.canReverse ? 'All rows pass the current checks. Confirmation will recheck the entire batch.'
          : 'This import cannot currently be undone as a whole.'}
      </p>}
      {state.isFresh && preview.canReverse && <button type="button" className="danger-button"
        disabled={busy || needsReload} onClick={() => void undo()}>{busy ? 'Undoing import…' : 'Undo import'}</button>}
      {preview.blockingReasons.length > 0 && <ul>{preview.blockingReasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
      <p className="field-help">Only transactions created by this import are considered. Edited, voided, missing, or mismatched records block the whole batch. Manual transactions and other imports must remain untouched.</p>
      <div className="import-reversal-table-scroll" role="region" aria-label="Undo preview rows" tabIndex={0}>
        <table className="import-reversal-table">
          <caption>Approved import rows — read-only preview</caption>
          <thead><tr><th scope="col">Source row</th><th scope="col">Date</th><th scope="col">Amount ({preview.currency})</th>
            <th scope="col">Description</th><th scope="col">Undo eligibility</th></tr></thead>
          <tbody>{preview.items.map((row, index) => <tr key={row.draftId ?? `${preview.page}-${index}`}>
            <th scope="row">{row.sourceRowNumber ?? 'Unknown'}</th><td>{row.transactionDate ?? '—'}</td>
            <td className="import-reversal-amount">{row.amount === null ? '—' : money!.format(row.amount)}</td>
            <td>{row.description ?? 'Unexpected transaction — details withheld'}</td>
            <td>{row.isEligible ? 'Eligible at last check' : <><strong>Blocked</strong><ul>{row.blockingReasons.map(reason => <li key={reason}>{reason}</li>)}</ul></>}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {preview.totalPages > 1 && <div className="import-reversal-pagination" aria-label="Undo preview pagination">
        <button className="secondary-button" type="button" disabled={busy || state.isPending || preview.page <= 1}
          onClick={() => setPage(preview.page - 1)}>Previous preview rows</button>
        <span>Page {preview.page} of {preview.totalPages}</span>
        <button className="secondary-button" type="button" disabled={busy || state.isPending || preview.page >= preview.totalPages}
          onClick={() => setPage(preview.page + 1)}>Next preview rows</button>
      </div>}
    </>}
  </section>
}
