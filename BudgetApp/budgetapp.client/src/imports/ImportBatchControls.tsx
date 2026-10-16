import { ContextualHelp } from '../components/ContextualHelp'
import { helpWarnings } from '../help/helpTopics'
import type { CategorizationRuleApplicationPreview } from './importApi'
import type { ReactNode } from 'react'

interface ImportBatchControlsProps {
  budgetTools?: ReactNode
  dirtyCount: number
  pendingRows: number
  validPendingRows: number
  reviewedRows: number
  hasUncheckedDuplicates: boolean
  bulkActionsBusy: boolean
  isSavingAll: boolean
  isCompleting: boolean
  isDiscarding: boolean
  applyingRuleMode: 'fill' | 'reapply' | null
  bulkDecision: 'Approved' | 'Excluded' | 'Pending' | null
  rulePreview: CategorizationRuleApplicationPreview | null
  rulePreviewFresh: boolean
  isLoadingRulePreview: boolean
  fillRulePotentialCount: number
  reapplyRulePotentialCount: number
  bulkSaveMessage: string
  ruleApplicationMessage: string
  onCheckDuplicates: () => Promise<void>
  onSaveAll: () => Promise<void>
  onApplyRules: (mode: 'fill' | 'reapply') => Promise<boolean>
  onDecision: (decision: 'Approved' | 'Excluded' | 'Pending') => Promise<void>
  onComplete: () => Promise<void>
  onDiscard: () => Promise<void>
}

// Presentation only: authorization, confirmations, writes, and response ownership stay in the page.
export function ImportBatchControls({ dirtyCount, pendingRows, validPendingRows, reviewedRows, hasUncheckedDuplicates,
  bulkActionsBusy, isSavingAll, isCompleting, isDiscarding, applyingRuleMode, bulkDecision,
  rulePreview, rulePreviewFresh, isLoadingRulePreview, fillRulePotentialCount, reapplyRulePotentialCount,
  bulkSaveMessage, ruleApplicationMessage, onCheckDuplicates, onSaveAll, onApplyRules, onDecision, onComplete, onDiscard, budgetTools }: ImportBatchControlsProps) {
  const hasUnsavedRows = dirtyCount > 0
  return (
    <div className="import-control-groups">
      <div className="import-control-group import-control-prepare">
        <strong>1. Prepare rows</strong>
        <div data-tutorial-id="import-bulk-budget-tools">
          {budgetTools}
          <div className="import-control-actions">
            <button
              className="primary-button"
              type="button"
              disabled={!hasUnsavedRows || bulkActionsBusy}
              onClick={() => void onSaveAll()}>
              {isSavingAll
                ? 'Saving corrections...'
                : `Save all corrections (${dirtyCount})`}
            </button>
          </div>
          {hasUnsavedRows && <p className="field-help">Save all corrections before approving or applying rules.</p>}
          {bulkSaveMessage && <p className="field-help" role="status">{bulkSaveMessage}</p>}
        </div>
        <div className="import-control-actions">
          {hasUncheckedDuplicates && (
            <button className="secondary-button" type="button"
              disabled={bulkActionsBusy}
              onClick={() => void onCheckDuplicates()}>
              Check for duplicates
            </button>
          )}
          <button className="secondary-button" type="button"
            disabled={
              !rulePreviewFresh ||
              !rulePreview ||
              fillRulePotentialCount === 0 ||
              hasUnsavedRows ||
              bulkActionsBusy
            }
            onClick={() => void onApplyRules('fill')}>
            {applyingRuleMode === 'fill'
              ? 'Filling categories...'
              : `Fill uncategorized (${
                isLoadingRulePreview ? '...' : rulePreviewFresh ? fillRulePotentialCount : 'unavailable'
              })`}
          </button>
          <button className="secondary-button" type="button"
            disabled={
              !rulePreviewFresh ||
              !rulePreview ||
              reapplyRulePotentialCount === 0 ||
              hasUnsavedRows ||
              bulkActionsBusy
            }
            onClick={() => void onApplyRules('reapply')}>
            {applyingRuleMode === 'reapply'
              ? 'Reapplying rules...'
              : `Reapply to all (${
                isLoadingRulePreview ? '...' : rulePreviewFresh ? reapplyRulePotentialCount : 'unavailable'
              })`}
          </button>
        </div>
        {!hasUnsavedRows && rulePreview && (
          <p className="field-help">
            Counts show matching rows that would actually change.
            {rulePreview.reapplyUnchangedRows > 0 && ` ${
              rulePreview.reapplyUnchangedRows
            } matching ${
              rulePreview.reapplyUnchangedRows === 1 ? 'row already has' : 'rows already have'
            } the rule category.`}
          </p>
        )}
        {ruleApplicationMessage && (
          <p className="field-help" role="status">{ruleApplicationMessage}</p>
        )}
      </div>
      <div className="import-control-group" data-tutorial-id="import-review-decisions">
        <strong>2. Review decisions</strong>
        <div className="import-control-actions">
          <button className="primary-button" type="button"
            disabled={validPendingRows === 0 || hasUnsavedRows || bulkActionsBusy}
            onClick={() => void onDecision('Approved')}>
            {bulkDecision === 'Approved' ? 'Approving...' : 'Approve all valid'}
          </button>
          <button className="secondary-button" type="button"
            disabled={pendingRows === 0 || hasUnsavedRows || bulkActionsBusy}
            onClick={() => void onDecision('Excluded')}>
            {bulkDecision === 'Excluded' ? 'Excluding...' : 'Exclude all'}
          </button>
        </div>
        <div className="import-control-undo">
          <button className="secondary-button" type="button"
            disabled={reviewedRows === 0 || hasUnsavedRows || bulkActionsBusy}
            onClick={() => void onDecision('Pending')}>
            {bulkDecision === 'Pending'
              ? 'Resetting decisions...'
              : `Reset decisions to pending (${reviewedRows})`}
          </button>
          <span>Saved corrections and categories are preserved.</span>
        </div>
      </div>
      <div className="import-control-group" data-tutorial-id="import-finalize">
        <strong>3. Finalize import</strong>
        <div className="import-control-actions">
          <button className="primary-button" type="button"
            disabled={pendingRows !== 0 || bulkActionsBusy || hasUnsavedRows}
            onClick={() => void onComplete()}>
            {isCompleting ? 'Creating...' : 'Create approved transactions'}
          </button>
        </div>
      </div>
      <div className="import-control-group import-control-danger">
        <strong>Staged data</strong>
        <p className="action-consequence">{helpWarnings.discardImport}</p>
        <ContextualHelp topic="destructive-actions" />
        <div className="import-control-actions">
          <button className="danger-button" type="button"
            disabled={bulkActionsBusy}
            onClick={() => void onDiscard()}>
            {isDiscarding ? 'Discarding...' : 'Discard staged import'}
          </button>
        </div>
      </div>
    </div>
  )
}
