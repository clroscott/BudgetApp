import { useRouter } from '../routing/useRouter'
import { SectionNavigation } from './SectionNavigation'

export function TransactionsSectionNav() {
  const { path } = useRouter()
  return <SectionNavigation section="transactions" currentPath={path} label="Transaction pages" />
}
