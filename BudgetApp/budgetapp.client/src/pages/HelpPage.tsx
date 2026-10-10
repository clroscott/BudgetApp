import { useEffect, useRef, type MouseEvent } from 'react'
import { useAuth } from '../auth/useAuth'
import { AppShell } from '../components/AppShell'
import { HelpSectionNav } from '../components/HelpSectionNav'
import { PageFrame } from '../components/PageFrame'
import { helpTopics, helpTopicUrl, requestedHelpTopic, type HelpTopicId } from '../help/helpTopics'
import { useHouseholds } from '../households/useHouseholds'
import { AppLink } from '../routing/AppLink'
import { focusPageElement } from '../routing/pageFocus'
import { useRouter } from '../routing/useRouter'

export function HelpPage() {
  const { user } = useAuth()
  const { currentHousehold } = useHouseholds()
  const { hash, navigate } = useRouter()
  const heading = useRef<HTMLHeadingElement>(null)
  const previousHash = useRef(hash)
  const selected = requestedHelpTopic(hash)
  useEffect(() => {
    if (previousHash.current === hash || !heading.current) return
    previousHash.current = hash
    return focusPageElement(heading.current)
  }, [hash])
  const choose = (event: MouseEvent<HTMLAnchorElement>, topic?: HelpTopicId) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate(topic ? helpTopicUrl(topic) : '/help')
  }
  const showNavigation = Boolean(user?.emailConfirmed && currentHousehold)
  const returnTo = !user ? '/login' : !user.emailConfirmed ? '/verify-email' : currentHousehold ? '/dashboard' : '/household/setup'
  const returnLabel = !user ? 'Return to sign in' : !user.emailConfirmed ? 'Return to confirmation' : currentHousehold ? 'Return to dashboard' : 'Return to household setup'
  return <AppShell showHouseholdNavigation={showNavigation}>
    <PageFrame>
        {showNavigation && <HelpSectionNav />}
        <div className="page-title-row"><div>
          <p className="eyebrow">Help · Read only</p>
          <h1 ref={heading}>{selected?.title ?? 'Help'}</h1>
          <p>{selected?.summary ?? 'Short answers about planning, privacy, and reviewing transactions. Reading help does not change your data.'}</p>
        </div>{!showNavigation && <AppLink className="header-link" to={returnTo}>{returnLabel}</AppLink>}</div>
        {hash && !selected && <p role="status">That help topic could not be found. Choose a topic below.</p>}
        <nav className="help-topic-navigation" aria-label="Help topics">
          <AppLink to="/help" aria-current={!selected ? 'page' : undefined} onClick={event => choose(event)}>All help topics</AppLink>
          {helpTopics.map(topic => <AppLink key={topic.id} to={helpTopicUrl(topic.id)}
            aria-current={selected?.id === topic.id ? 'page' : undefined} onClick={event => choose(event, topic.id)}>{topic.title}</AppLink>)}
        </nav>
        {selected ? <article className="help-article readable-panel" aria-label={selected.title}>
          {selected.sections.map(section => <section key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs?.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
            {section.points && <ul>{section.points.map(point => <li key={point}>{point}</li>)}</ul>}
          </section>)}
        </article> : <div className="help-topic-list readable-panel">
          {helpTopics.map(topic => <article key={topic.id}>
            <h2><AppLink to={helpTopicUrl(topic.id)} onClick={event => choose(event, topic.id)}>{topic.title}</AppLink></h2>
            <p>{topic.summary}</p>
          </article>)}
        </div>}
        {showNavigation && <p className="field-help">Prefer a step-by-step walkthrough? <AppLink to="/tutorials">Browse tutorials</AppLink>. Help does not start a tutorial or perform its actions.</p>}
    </PageFrame>
  </AppShell>
}
