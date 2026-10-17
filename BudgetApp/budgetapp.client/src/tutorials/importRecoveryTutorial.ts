import type { TutorialDefinition } from './tutorialDefinitions'
export const importRecoveryTutorial: TutorialDefinition = {
  key: 'fix-mistaken-import', version: 1, kind: 'GuidedFinancialTask', title: 'Fix a mistaken import', resumeBehavior: 'restart',
  description: 'Choose a staged correction, permanent discard, or a checked whole-batch undo.', estimatedMinutes: 5,
  steps: [
    { title: 'Choose the exact import', targetId: 'import-file-picker', body: 'Check file, account, worksheet and status. Unfinished imports contain staged rows; Completed imports have already created transactions. Choose only a file you can see.' },
    { title: 'What needs fixing?', targetId: 'import-review-summary', body: 'Correct staged rows when only their values are wrong. Discard an unfinished file only if you no longer need its staging. A completed batch uses Undo preview—not Delete.' },
    { title: 'Check before changing', targetId: 'import-review-grid', fallbackTargetIds: ['import-review-summary'], body: 'Correct only intended staged rows. Already correct? Keep them unchanged. The tutorial never edits, discards or undoes an import for you.' },
    { title: 'Use the page action', targetId: 'import-bulk-budget-tools', fallbackTargetIds: ['import-review-summary'], body: 'Use Save all corrections for intended edits, then check the saved rows. Changed approved rows return to Pending. No approval is required just to finish this guide.' },
    { title: 'Verify saved status and history', targetId: 'import-review-summary', fallbackTargetIds: ['import-recovery-result'], body: 'Check the actual saved result. Undo voids the whole completed batch and keeps history; staged discard is permanent. Check Transactions and change history as needed; no other import or manual transaction should change.' },
    { title: 'Continue safely', targetId: 'import-recovery-result', body: 'Continue review stays here. Corrected files start as new staged imports, with normal warnings, review and approval.' },
  ].map(step => ({ ...step, route: '/imports/review', advance: 'outcome' as const })),
}
