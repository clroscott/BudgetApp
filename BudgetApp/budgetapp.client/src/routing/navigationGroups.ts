import { appPages, type AppPageDefinition } from './pageRegistry'

// Group existing routes; URLs and tutorial navigation target IDs do not change.
const definitions = [
  { id: 'dashboard', label: 'Dashboard', pageId: 'dashboard', children: [] },
  { id: 'transactions', label: 'Transactions', pageId: 'transactions', children: ['import', 'import-review', 'categorization-rules', 'import-profiles'] },
  { id: 'budgeting', label: 'Budgeting', pageId: 'monthly-budget', children: ['annual-targets', 'annual-overview', 'recurring-expenses', 'categories'] },
  { id: 'accounts', label: 'Financial accounts', pageId: 'accounts', children: [] },
  { id: 'household', label: 'Household', pageId: 'household', children: ['household-settings', 'activity'] },
  { id: 'help', label: 'Help', pageId: 'help', children: ['tutorials'] },
]

export const mainNavigationGroups = definitions.flatMap(definition => {
  const page = appPages.find(item => item.id === definition.pageId)
  if (!page) return []
  const children = definition.children.flatMap(id => {
    const child = appPages.find(item => item.id === id)
    return child ? [child] : []
  })
  return [{ ...definition, page, children }]
})

export function groupForPath(path: string) {
  return mainNavigationGroups.find(group => group.page.path === path || group.children.some(page => page.path === path))
}

export function sectionPages(id: string): AppPageDefinition[] {
  const group = mainNavigationGroups.find(item => item.id === id)
  return group ? [group.page, ...group.children] : []
}
