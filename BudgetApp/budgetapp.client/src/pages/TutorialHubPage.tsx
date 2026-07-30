import { BrandLockup } from '../components/Brand'
import { ErrorSummary } from '../components/ErrorSummary'
import { AppLink } from '../routing/AppLink'
import { tutorialDefinitions } from '../tutorials/tutorialDefinitions'
import type { TutorialKind } from '../tutorials/tutorialDefinitions'
import { useTutorials } from '../tutorials/useTutorials'

const plannedTutorials = [
  {
    title: 'Household vs Personal',
    description:
      'Understand account scope, budget scope, visibility, and shared categories.',
    kind: 'LearnOnly' as TutorialKind,
  },
  {
    title: 'Set up your finances',
    description:
      'Create accounts and organize categories and subcategories.',
    kind: 'GuidedSetup' as TutorialKind,
  },
  {
    title: 'Build your first budget',
    description:
      'Set annual targets, allocate months, and activate a monthly budget.',
    kind: 'GuidedFinancialTask' as TutorialKind,
  },
  {
    title: 'Import your first CSV',
    description:
      'Choose an account, map columns, review staged rows, and create transactions.',
    kind: 'GuidedFinancialTask' as TutorialKind,
  },
  {
    title: 'Categorize transactions efficiently',
    description:
      'Correct categories, create rules, and apply them to matching transactions.',
    kind: 'GuidedFinancialTask' as TutorialKind,
  },
  {
    title: 'Recurring expenses',
    description:
      'Configure expected expenses and use them to build monthly budget drafts.',
    kind: 'GuidedSetup' as TutorialKind,
  },
  {
    title: 'Household setup and invitations',
    description:
      'Invite another person and understand roles, acceptance, and household access.',
    kind: 'GuidedSetup' as TutorialKind,
  },
  {
    title: 'Search and edit transactions',
    description:
      'Use date and category filters, correct transactions, and save multiple edits.',
    kind: 'GuidedFinancialTask' as TutorialKind,
  },
  {
    title: 'Copy, reset, and reopen budgets',
    description:
      'Reuse earlier plans and understand Draft, Active, and Closed budget states.',
    kind: 'GuidedFinancialTask' as TutorialKind,
  },
  {
    title: 'Read the Annual Overview',
    description:
      'Interpret budgeted, actual, remaining, income, and monthly category results.',
    kind: 'LearnOnly' as TutorialKind,
  },
  {
    title: 'Review household activity',
    description:
      'Use the activity log to see who changed important household information.',
    kind: 'LearnOnly' as TutorialKind,
  },
  {
    title: 'Customize your Dashboard',
    description:
      'Add, remove, reorder, and resize the shortcuts on your Dashboard.',
    kind: 'GuidedSetup' as TutorialKind,
  },
  {
    title: 'Manage CSV import profiles',
    description:
      'Save reusable column mappings for different banks and file structures.',
    kind: 'GuidedSetup' as TutorialKind,
  },
  {
    title: 'Export transaction data',
    description:
      'Export the currently filtered transaction results to a readable CSV file.',
    kind: 'LearnOnly' as TutorialKind,
  },
  {
    title: 'Recover your password',
    description:
      'Request and use a password-reset message without exposing recovery tokens.',
    kind: 'GuidedSetup' as TutorialKind,
  },
]

const tutorialKinds: Record<TutorialKind, {
  label: string
  description: string
}> = {
  LearnOnly: {
    label: 'Learn only',
    description: 'Explains and navigates without changing your data.',
  },
  GuidedSetup: {
    label: 'Guided setup',
    description: 'Helps you create configuration using values you choose.',
  },
  GuidedFinancialTask: {
    label: 'Guided financial task',
    description: 'May create budgets, imports, or transactions after confirmation.',
  },
}

function TutorialKindBadge({ kind }: { kind: TutorialKind }) {
  return (
    <span className={`tutorial-kind tutorial-kind-${kind.toLowerCase()}`}>
      {tutorialKinds[kind].label}
    </span>
  )
}

export function TutorialHubPage() {
  const {
    dismiss,
    error,
    isLoading,
    progress,
    start,
  } = useTutorials()

  return (
    <main className="management-page tutorial-hub-page">
      <header className="app-header">
        <BrandLockup />
        <AppLink className="header-link" to="/dashboard">
          Return to dashboard
        </AppLink>
      </header>
      <section className="management-content tutorial-hub-content">
        <div className="page-title-row">
          <div>
            <p className="eyebrow">Help and learning</p>
            <h1>Tutorials</h1>
            <p>
              Learn BudgetApp through guided, replayable walkthroughs.
              Tutorials explain the real application but never create financial
              data without your action.
            </p>
          </div>
        </div>

        <ErrorSummary errors={error ? [error] : []} />

        <div className="tutorial-library">
          {(Object.entries(tutorialKinds) as Array<
            [TutorialKind, (typeof tutorialKinds)[TutorialKind]]
          >).map(([kind, details]) => (
            <section
              className={`tutorial-kind-section tutorial-kind-section-${kind.toLowerCase()}`}
              key={kind}
            >
              <div className="tutorial-kind-heading">
                <TutorialKindBadge kind={kind} />
                <div>
                  <h2>{details.label}</h2>
                  <p>{details.description}</p>
                </div>
              </div>
              <div className="tutorial-list">
                {tutorialDefinitions
                  .filter(tutorial => tutorial.kind === kind)
                  .map(tutorial => {
                    const saved = progress.find(item =>
                      item.tutorialKey === tutorial.key &&
                      item.tutorialVersion === tutorial.version)
                    const status = saved?.status ?? 'NotStarted'
                    return (
                      <article className="tutorial-card" key={tutorial.key}>
                        <div>
                          <span className={`tutorial-status tutorial-status-${status.toLowerCase()}`}>
                            {status === 'NotStarted' ? 'Not started' : status}
                          </span>
                          <h2>{tutorial.title}</h2>
                          <p>{tutorial.description}</p>
                          <small>
                            {tutorial.steps.length} steps · about{' '}
                            {tutorial.estimatedMinutes} minutes
                          </small>
                        </div>
                        <div className="tutorial-card-actions">
                          <button type="button" disabled={isLoading}
                            onClick={() => void start(
                              tutorial.key,
                              status === 'InProgress',
                            )}>
                            {status === 'InProgress'
                              ? 'Resume tutorial'
                              : status === 'Completed'
                                ? 'Replay tutorial'
                                : 'Start tutorial'}
                          </button>
                          {status === 'NotStarted' &&
                            <button className="text-button" type="button"
                              onClick={() => void dismiss(tutorial.key)}>
                              Not now
                            </button>}
                        </div>
                      </article>
                    )
                  })}
                {plannedTutorials
                  .filter(tutorial => tutorial.kind === kind)
                  .map(tutorial => (
                    <article
                      className="tutorial-card tutorial-card-coming-soon"
                      key={tutorial.title}
                    >
                      <div>
                        <span className="tutorial-status">Coming soon</span>
                        <h2>{tutorial.title}</h2>
                        <p>{tutorial.description}</p>
                      </div>
                    </article>
                  ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </main>
  )
}
