import type { TutorialDefinition } from './tutorialDefinitions'

const readFilters = ['transaction-tour-form', 'transaction-tour-currency', 'transaction-tour-spending', 'transaction-tour-inclusion',
  'transaction-tour-account', 'transaction-tour-date-mode', 'transaction-tour-days', 'transaction-tour-date', 'transaction-tour-month',
  'transaction-tour-from', 'transaction-tour-to', 'transaction-tour-type', 'transaction-tour-category', 'transaction-tour-subcategory',
  'transaction-tour-description', 'transaction-tour-apply', 'transaction-tour-reset']
export const exportTutorial: TutorialDefinition = {
  key: 'export-transactions', version: 1, kind: 'LearnOnly', presentation: 'read-companion', resumeBehavior: 'restart',
  title: 'Export transaction data', description: 'Filter saved records, understand export boundaries, and optionally download a private CSV.',
  estimatedMinutes: 3, continueLabel: 'Continue with transactions',
  steps: [
    { title: 'Choose what to export', targetId: 'transaction-tour-form', readControls: readFilters,
      body: 'Choose account, dates, category or description. Apply filters before continuing. These controls only change the view; they do not edit transactions.',
      details: 'Use All dates when you want full history. Currency and budget-inclusion filters matter. Personal-account details remain visible only to permitted users. The tutorial cannot save a filter preset or edit a record.' },
    { title: 'Check the active filters', targetId: 'transaction-tour-active',
      body: 'Export uses these applied filters—not unfinished filter edits. It includes matching saved records across all pages, not just the rows currently on screen.',
      details: 'Undone import batches are omitted. Shared expenses use the permitted, redacted projection: another member’s private account name and notes are not exposed. Ordinary excluded/voided records depend on the active inclusion rules shown here.' },
    { title: 'Check the count and currencies', targetId: 'transaction-tour-totals',
      body: 'Check the matching count and each currency separately. Positive amounts are spending; negative amounts can be income, refunds or credits. Empty results do not create sample rows.',
      details: 'Matching totals cover every result page. A failed or stale read is not zero. CSV uses the saved values at export time; another user’s later changes may make a subsequent export different.' },
    { title: 'Download only if you want it', targetId: 'transaction-tour-export', readControls: ['transaction-tour-export', 'transaction-tour-download'],
      body: 'This CSV contains financial data. Keep it private. Choose Export matching transactions if you want a file, or Next to finish without downloading anything.',
      details: 'The browser handles the download location. An explicit click requests one export; replay and tutorial navigation never repeat it. Export does not change transactions. If it fails, read the error and Retry search before another deliberate request.' },
    { title: 'Your records stay unchanged', targetId: 'transaction-tour-count',
      body: 'If you requested a file, check your browser’s downloads. Otherwise nothing was downloaded. Continue with transactions keeps this view; Return to tutorials opens the tutorial list.',
      details: 'The guide does not claim the browser saved a file successfully. Check the download yourself. Protect or securely dispose of local CSV copies when no longer needed; they are not encrypted database backups.' },
  ].map(step => ({ ...step, route: '/transactions', advance: 'next' as const, readControls: [...step.readControls ?? [], 'read-tour-reload'] })),
}
