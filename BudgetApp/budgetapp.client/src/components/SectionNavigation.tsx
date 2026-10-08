import { sectionPages } from '../routing/navigationGroups'
import { AppLink } from '../routing/AppLink'

export function SectionNavigation({ section, currentPath, label }: {
  section: string, currentPath: string, label: string,
}) {
  return <nav className="budgeting-section-nav section-navigation" aria-label={label}>
    {sectionPages(section).map(page => <AppLink key={page.id} to={page.path}
      aria-current={page.path === currentPath ? 'page' : undefined}
      className={page.path === currentPath ? 'active' : undefined}>{page.label}</AppLink>)}
  </nav>
}
