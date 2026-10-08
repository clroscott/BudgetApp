import { useRouter } from '../routing/useRouter'
import { SectionNavigation } from './SectionNavigation'

export function HelpSectionNav() {
  const { path } = useRouter()
  return <SectionNavigation section="help" currentPath={path} label="Help pages" />
}
