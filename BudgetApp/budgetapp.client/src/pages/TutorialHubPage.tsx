import { PageFrame } from '../components/PageFrame'
import { ErrorSummary } from '../components/ErrorSummary'
import { HelpSectionNav } from '../components/HelpSectionNav'
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
    <PageFrame contentClassName="tutorial-hub-content">
        <HelpSectionNav />
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

        <p className="field-help">Need a quick explanation instead? <AppLink to="/help">Browse help topics</AppLink>.</p>
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
                  .filter(tutorial => tutorial.kind === kind && tutorial.key !== 'budget-from-annual-targets')
                  .map(tutorial => {
                    const saved = progress.find(item =>
                      item.tutorialKey === tutorial.key &&
                      item.tutorialVersion === tutorial.version)
                    const status = saved?.status ?? 'NotStarted'
                    const canResume = tutorial.resumeBehavior !== 'restart'
                    return (
                      <article className="tutorial-card" key={tutorial.key}>
                        <div>
                          <span className={`tutorial-status tutorial-status-${status.toLowerCase()}`}>
                            {status === 'NotStarted' ? 'Not started' : status}
                          </span>
                          <h2>{tutorial.title}</h2>
                          <p>{tutorial.description}</p>
                          {status === 'InProgress' && !canResume &&
                            <p>Restarts the guide, not your saved work.</p>}
                          <small>
                            {tutorial.steps.length} steps · about{' '}
                            {tutorial.estimatedMinutes} minutes
                          </small>
                        </div>
                        <div className="tutorial-card-actions">
                          {tutorial.key === 'build-first-budget' && <button type="button" className="secondary-button" disabled={isLoading}
                            onClick={() => void start('budget-from-annual-targets')}>
                            {progress.some(item => item.tutorialKey === 'budget-from-annual-targets' && item.tutorialVersion === 1 && item.status !== 'Dismissed') ? 'Start again from annual targets' : 'Start from annual targets'}
                          </button>}
                          <button type="button" disabled={isLoading}
                            onClick={() => void start(
                              tutorial.key,
                              status === 'InProgress' && canResume,
                            )}>
                            {tutorial.key === 'build-first-budget' ? status === 'InProgress' ? 'Quick monthly — start again' : status === 'Completed' ? 'Replay Quick monthly' : 'Quick monthly budget' : status === 'InProgress'
                              ? canResume ? 'Resume tutorial' : 'Start again'
                              : status === 'Completed'
                                ? 'Replay tutorial'
                                : 'Start tutorial'}
                          </button>
                          {status === 'InProgress' && canResume &&
                            <button className="secondary-button" type="button" disabled={isLoading}
                              onClick={() => void start(tutorial.key, false)}>
                              Start again
                            </button>}
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
    </PageFrame>
  )
}
