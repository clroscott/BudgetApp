import { useRef, type KeyboardEvent } from 'react'
import { helpTopicById, helpTopicUrl, type HelpTopicId } from '../help/helpTopics'
import { AppLink } from '../routing/AppLink'
import { AppIcon } from './AppIcon'

export function ContextualHelp({ topic }: { topic: HelpTopicId }) {
  const content = helpTopicById[topic]
  const root = useRef<HTMLDetailsElement>(null)
  const close = (event: KeyboardEvent<HTMLDetailsElement>) => {
    if (event.key !== 'Escape' || !root.current?.open) return
    event.preventDefault()
    event.stopPropagation()
    root.current.open = false
    root.current.querySelector('summary')?.focus()
  }
  return <details className="contextual-help" ref={root} onKeyDown={close}>
    <summary><AppIcon name="help" />{content.trigger}</summary>
    <div className="contextual-help-body">
      <p>{content.summary}</p>
      <AppLink to={helpTopicUrl(topic)}>Read more: {content.title}</AppLink>
    </div>
  </details>
}
