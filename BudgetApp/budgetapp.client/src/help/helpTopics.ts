export type HelpTopicId = 'scope-privacy' | 'budget-states' | 'annual-targets' | 'import-approval' | 'destructive-actions'

export interface HelpTopic {
  id: HelpTopicId
  title: string
  trigger: string
  summary: string
  sections: Array<{ title: string, paragraphs?: string[], points?: string[] }>
}

// One vocabulary for inline explanations and their deeper, read-only help.
export const helpTopics: readonly HelpTopic[] = [
  {
    id: 'scope-privacy', title: 'Scope and privacy', trigger: 'About scope and privacy',
    summary: 'Account scope controls who can access a financial account. Budget inclusion controls where a transaction counts. Personal + Household counts the full amount in each budget without splitting or duplicating the transaction.',
    sections: [
      { title: 'Separate plans, one transaction', points: [
        'Household budgets and annual targets are shared plans. Personal plans and Personal inclusion choices belong to the signed-in user.',
        'Select My personal budget, Household budget, both, or neither. A $1,200 rent transaction selected for both contributes $1,200 to each budget, but is recorded only once.',
        'Personal and Household totals can overlap. Do not add them together as a combined spending total.',
        'Selecting neither budget keeps the transaction in the ledger but excludes it from your budget actuals. This is different from excluding a staged import row.',
      ] },
      { title: 'Sharing a personal-account expense', points: [
        'Household inclusion shares the transaction date, amount, currency, category, description, source, and review/void state. Choose a description suitable for household members.',
        'The personal account identity/details, posted date, merchant, private notes, original CSV text, and import file remain private. Other members see Shared expense (private account).',
        'Removing Household inclusion from a personal-account transaction hides it from other members and removes it from their Personal actuals. Their Personal selection never grants access to private data.',
      ] },
      { title: 'Permissions and account scope', points: [
        'Only the personal-account owner can change its financial details or Household inclusion. Viewers cannot change Household inclusion, including for their own personal account.',
        'Each member can change only their own Personal inclusion on a transaction they can already see. This does not change another member’s Personal choice.',
        'Changing account scope changes account access; it does not automatically change saved transaction budget inclusion. Reports keep currencies separate.',
      ] },
    ],
  },
  {
    id: 'budget-states', title: 'Monthly budget states', trigger: 'About budget states',
    summary: 'Draft amounts can be edited, replaced from annual targets, or deleted. Active amounts remain editable but are protected from annual replacement. Closed planned amounts are read-only; actuals can still change when transactions are corrected.',
    sections: [
      { title: 'Draft, Active, and Closed', points: [
        'Draft: a planning budget. Save before activating. Annual allocation replaces its amounts only when you explicitly enable Draft replacement and confirm.',
        'Active: an editable budget protected from annual allocation. Return to Draft before replacing it from annual targets or deleting it.',
        'Closed: planned amounts are read-only. Reopen to allow changes again. Closing does not freeze the transaction ledger or historical actuals.',
        'Available actions depend on your household role. Viewers cannot change monthly budgets.',
      ] },
      { title: 'Missing is not zero', paragraphs: [
        'No budget means no monthly budget or no amount has been saved for that category. A saved zero is an explicit zero-dollar plan. A failed load cannot establish whether a budget is missing; retry the read before creating anything.',
        'Within a parent category, use either an Overall amount or Detailed subcategory amounts. Switching modes clears the other mode’s entered amounts after confirmation; saving persists the change.',
      ] },
    ],
  },
  {
    id: 'annual-targets', title: 'Annual targets and monthly drafts', trigger: 'About annual targets',
    summary: 'Annual targets are a planning guide, not actual spending or automatically synchronized monthly budgets. Create drafts only for selected months. Existing Active and Closed budgets are never replaced by annual allocation.',
    sections: [
      { title: 'Targets versus reports', points: [
        'Annual Targets stores category plans for a fiscal year. Annual Overview is a read-only calendar-year report calculated from monthly budgets and included transactions; it does not use targets as another source of budget truth.',
        'Monthly and quarterly guidance shows the annual target divided by 12 and 4. Exact monthly allocation distributes remainder cents so all 12 months add back to the annual target.',
        'A blank target means none is defined; a saved zero is an explicit zero target. Each parent section uses Overall or Detailed targets, not both.',
      ] },
      { title: 'Fiscal defaults and existing plans', paragraphs: [
        'The fiscal starting year names the year in which the plan begins. For example, an April 2027 start covers April 2027 through March 2028.',
        'The household fiscal default, managed by Owners/Admins in Household settings, initializes new unsaved plans. Each saved annual plan has its own start month. Changing either default or a plan’s start month does not move or rewrite existing monthly budgets.',
      ] },
      { title: 'Creating selected monthly drafts', points: [
        'Choose individual months, Select all, or Select none. The impact list shows what will be created, kept, replaced, or protected before you continue.',
        'Existing budgets are kept by default. Enable Draft replacement explicitly to replace existing Draft amounts after confirmation. Active and Closed months remain protected.',
        'Generated monthly budgets are independent copies. Later target changes do not silently update them; monthly edits do not change the annual plan.',
      ] },
    ],
  },
  {
    id: 'import-approval', title: 'Import review and approval', trigger: 'About import approval',
    summary: 'Uploading stages rows for review. Approve or exclude every pending row, then choose Create approved transactions. Approval alone does not add rows to Transactions or budget actuals.',
    sections: [
      { title: 'Upload → Review → Approve → Create', points: [
        'Upload for review creates a staged import, not ledger transactions. Review dates, amounts, descriptions, categories, duplicate warnings, and budget inclusion.',
        'Save all corrections before bulk approvals or rules. Save and approve handles an individual row. Changed approved rows return to Pending when corrections are saved.',
        'Approve means the row is ready to create. Exclude means do not create a transaction from that row. Reset decisions to pending preserves saved corrections and categories.',
        'Once every row has a decision, Create approved transactions adds only approved rows to the ledger and budget actuals. Completing the same import again does not create additional transactions.',
      ] },
      { title: 'Budget inclusion and bulk choices', points: [
        'Household-account rows default to Household only. Personal-account rows default to the owner’s Personal budget only. Review inclusion before sharing personal-account expenses.',
        'Selecting neither budget still creates an approved transaction in the ledger. Excluding the row prevents transaction creation entirely.',
        'Bulk budget inclusion applies to the current page or all matching rows across pages, respecting the row filter. Preview changed/skipped counts, apply choices, then Save all corrections.',
        'Excluded, linked, and permission-protected rows are skipped. Another reviewer cannot overwrite a Personal choice that belongs to a different reviewer.',
        'Duplicate warnings need review before approval. Allowing a duplicate file upload does not mean its transaction rows are safe to approve twice.',
      ] },
    ],
  },
  {
    id: 'destructive-actions', title: 'Deletion, replacement, and recovery', trigger: 'About removal and replacement',
    summary: 'Check exactly what an action removes or replaces before confirming. Deleting a Draft removes planned amounts, not transactions. Discarding an import removes staged data. Neither operation has an in-app Undo.',
    sections: [
      { title: 'What changes and what stays', points: [
        'Delete draft removes that monthly Draft and its planned amounts. Existing transactions are not deleted. Creating a new budget later does not recover the old amounts.',
        'Replace Draft amounts copies annual allocations over the existing selected Draft’s planned amounts. It does not delete ledger transactions. Active and Closed budgets are protected.',
        'Return to draft is a status change, not a deletion. It makes an Active budget eligible for later replacement or deletion.',
        'Remove CSV row permanently removes that staged row. Discard staged import removes the import and its staged rows; it is not a way to undo a completed import or delete ledger transactions.',
        'Deactivate an account, category, or recurring expense is different from deleting it. Existing history is retained; check that page’s available reactivation controls.',
      ] },
      { title: 'Before confirming', paragraphs: [
        'Read the affected month, scope, row/file name, and counts shown by the action. Save needed corrections first. Canceling a confirmation does not perform the action.',
        'Help never executes an action for you. If a write fails or its result is uncertain, inspect/reload the saved state before repeating it. Do not assume a failed refresh means the write did not happen.',
        'There is no in-app Undo for permanent deletion or replacement. Ask the installation administrator about backup recovery; recovery is not guaranteed by this page.',
      ] },
    ],
  },
]

export const helpTopicById = Object.fromEntries(helpTopics.map(topic => [topic.id, topic])) as Record<HelpTopicId, HelpTopic>
export const helpTopicUrl = (id: HelpTopicId) => `/help#${id}`
export function requestedHelpTopic(hash: string) {
  // Only known static IDs are accepted. Never render URL contents as HTML.
  return helpTopics.find(topic => `#${topic.id}` === hash)
}

// Critical warnings stay visible near the action, and in its confirmation.
export const helpWarnings = {
  sharePersonalExpense: 'Including a personal-account expense in Household shares its date, amount, currency, category, description, source, and review/void state. Your account details, private notes, and import file stay private.',
  deleteDraft: 'Deleting this Draft removes its planned amounts, not transactions. Deletion cannot be undone.',
  returnToDraft: 'Returning to Draft allows this budget’s amounts to be replaced from annual targets or deleted later.',
  replaceDrafts: 'Replacement overwrites selected existing Draft amounts, not transactions. There is no in-app Undo. Active and Closed budgets stay protected.',
  discardImport: 'Discarding removes this import and its staged rows, not existing ledger transactions. This cannot be undone.',
  confirmDeleteDraft: 'Delete this draft budget and all of its amounts? This cannot be undone. Existing transactions will not be deleted.',
  confirmReturnToDraft: 'Return this active budget to Draft? It can then be replaced from annual targets or deleted. Existing transactions will not be changed.',
  confirmDiscardImport: (fileName: string) => `Discard ${fileName} and all of its staged rows? This cannot be undone. Existing ledger transactions will not be deleted.`,
}
