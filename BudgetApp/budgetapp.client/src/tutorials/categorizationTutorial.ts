import type { TutorialDefinition } from './tutorialDefinitions'
export const categorizationTutorial: TutorialDefinition = {
  key: 'categorize-transactions', version: 1, kind: 'GuidedFinancialTask', title: 'Categorize transactions', resumeBehavior: 'restart',
  description: 'Correct a saved transaction or staged rows, then optionally reuse an import rule.', estimatedMinutes: 6,
  steps: [
    { title: 'Where is the transaction?', targetId: 'transaction-tour-count', body: 'Choose saved Transactions or staged Import review. They save differently. Nothing changes when you choose a path.' },
    { title: 'Choose the right record', targetId: 'transaction-task-picker', body: 'Choose a visible transaction. For an import, choose the exact file. Check the date, description and account before making any correction.' },
    { title: 'Choose a category', targetId: 'transaction-task-editor', fallbackTargetIds: ['transaction-task-record'], body: 'Open Edit if needed. Choose the overall category or a specific subcategory. Already correct? Leave it unchanged. The tutorial does not make an example edit.' },
    { title: 'Save and check', targetId: 'transaction-task-save', fallbackTargetIds: ['transaction-task-record', 'transaction-task-outcome'], body: 'Save transaction—or Cancel—on the page. Import rows use Save all corrections. Saving changed approved import rows returns them to Pending. Check current saved categories before continuing.' },
    { title: 'Repeatable description?', targetId: 'transaction-task-outcome', body: 'A reusable rule can categorize future imported descriptions. It does not automatically rewrite every saved transaction. Create or inspect a rule only if useful; you can finish without one.' },
    { title: 'Choose a reusable rule', targetId: 'category-tour-picker', body: 'Use an existing active rule first, or explicitly choose New rule. Check match method, text, account restriction and category. Earlier active rules have priority.' },
    { title: 'Save the rule—or keep it', targetId: 'category-tour-save', fallbackTargetIds: ['category-tour-selected', 'category-tour-picker'], body: 'Save with the normal page button if you changed it. A correct existing rule needs no edit. Rule creation alone does not change saved transactions.' },
    { title: 'Check staged effects', targetId: 'transaction-task-outcome', body: 'This saved transaction is not changed by creating a rule. For staged import rows, inspect the affected counts before applying Fill uncategorized or Reapply. No matching rows is a valid result.' },
    { title: 'Categories reviewed', targetId: 'transaction-tour-count', body: 'Continue stays with your records. Active rules can help future imports; nothing is applied or approved automatically.' },
  ].map((step, index) => ({ ...step, route: index === 5 || index === 6 ? '/settings/categorization-rules' : '/transactions', advance: 'outcome' as const })),
}
