import type { TutorialDefinition } from './tutorialDefinitions'
const route = '/activity'
const filters = ['activity-tour-form', 'activity-tour-from', 'activity-tour-to', 'activity-tour-person',
  'activity-tour-action', 'activity-tour-type', 'activity-tour-apply', 'activity-tour-reset']
export const activityTutorial: TutorialDefinition = {
  key: 'review-activity', version: 1, kind: 'LearnOnly', presentation: 'read-companion', resumeBehavior: 'restart',
  title: 'Review household activity', estimatedMinutes: 3, continueLabel: 'Continue reviewing',
  description: 'Find a change, inspect its details, and understand what history can—and cannot—tell you.',
  steps: [
    { title: 'Whose changes can you see?', targetId: 'activity-tour-title', body: 'Change history shows shared household changes and your own personal activity. Joining a household does not reveal another member’s private activity.',
      details: 'Only entries permitted by your current membership and visibility are returned. The tutorial does not request hidden entries or copy their contents into progress.' },
    { title: 'Narrow the history', targetId: 'activity-tour-form', readControls: filters,
      body: 'Choose dates, a visible person, action or record type. Apply filters reads matching history; it does not change the recorded actions.',
      details: 'An empty result is valid. Reset clears the read filters, not financial data. Filters can be reused on later visits; the guide never creates activity merely to fill the list.' },
    { title: 'Inspect an entry', targetId: 'activity-tour-entry', fallbackTargetIds: ['activity-tour-empty'], readControls: ['activity-tour-details'],
      body: 'Each entry names who acted, when, and what changed. Open View details when available. If nothing matches, broaden the filters later—no activity is invented.',
      details: 'Some events have no extra details. Private fields and recovery material are not exposed by this guide. The server remains responsible for visibility.' },
    { title: 'Check every matching page', targetId: 'activity-tour-pages', fallbackTargetIds: ['activity-tour-count'], readControls: ['activity-tour-previous', 'activity-tour-next'],
      body: 'The count covers matching visible events. Use Previous and Next when there are more pages. A failed load is not proof that there were no changes.',
      details: 'Dates and the person/action/type filters apply across pages. The same user can see different results after household membership changes; restart the guide in the new context.' },
    { title: 'History is not Undo', targetId: 'activity-tour-count',
      body: 'Reading an entry never reverses its action. Use the original feature for a deliberate correction. Continue reviewing keeps this view; Return to tutorials opens the list.',
      details: 'Some actions cannot be undone, and eligible import reversal has its own preview and safeguards. Finishing records tutorial progress only, never an audit event or a financial correction.' },
  ].map(step => ({ ...step, route, advance: 'next' as const, readControls: [...step.readControls ?? [], 'read-tour-reload'] })),
}
