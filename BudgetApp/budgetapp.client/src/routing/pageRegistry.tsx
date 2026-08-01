import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { AppIconName } from '../components/AppIcon'

export type PageAccess = 'public' | 'anonymous' | 'household-setup' | 'household'
export type NavigationSection = 'primary' | 'settings'

interface PageNavigation {
  section: NavigationSection
  order: number
}

interface PageDashboardShortcut {
  panelKey: string
  panelLabel: string
  panelTitle: string
  panelDescription: string
  linkLabel: string
  defaultOrder?: number
}

export interface AppPageDefinition {
  id: string
  path: string
  label: string
  icon?: AppIconName
  access: PageAccess
  component: LazyExoticComponent<ComponentType>
  navigation?: PageNavigation
  dashboard?: PageDashboardShortcut
}

export interface DashboardPanelDefinition {
  icon: AppIconName
  key: string
  label: string
  title: string
  description: string
  defaultOrder?: number
  links: Array<{ label: string, to: string }>
}

function page(loader: () => Promise<Record<string, unknown>>, exportName: string) {
  return lazy(async () => {
    const module = await loader()
    return { default: module[exportName] as ComponentType }
  })
}

export const appPages: AppPageDefinition[] = [
  {
    id: 'login',
    path: '/login',
    label: 'Log in',
    access: 'anonymous',
    component: page(() => import('../pages/LoginPage'), 'LoginPage'),
  },
  {
    id: 'register',
    path: '/register',
    label: 'Register',
    access: 'anonymous',
    component: page(() => import('../pages/RegisterPage'), 'RegisterPage'),
  },
  {
    id: 'forgot-password',
    path: '/forgot-password',
    label: 'Forgot password',
    access: 'anonymous',
    component: page(
      () => import('../pages/ForgotPasswordPage'),
      'ForgotPasswordPage',
    ),
  },
  {
    id: 'reset-password',
    path: '/reset-password',
    label: 'Reset password',
    access: 'public',
    component: page(
      () => import('../pages/ResetPasswordPage'),
      'ResetPasswordPage',
    ),
  },
  {
    id: 'household-invitation-accept',
    path: '/household-invitations/accept',
    label: 'Household invitation',
    access: 'public',
    component: page(
      () => import('../pages/HouseholdInvitationAcceptancePage'),
      'HouseholdInvitationAcceptancePage',
    ),
  },
  {
    id: 'household-setup',
    path: '/household/setup',
    label: 'Household setup',
    access: 'household-setup',
    component: page(() => import('../pages/HouseholdSetupPage'), 'HouseholdSetupPage'),
  },
  {
    id: 'household-create',
    path: '/households/new',
    label: 'Create household',
    access: 'household',
    component: page(
      () => import('../pages/HouseholdCreatePage'),
      'HouseholdCreatePage',
    ),
  },
  {
    id: 'dashboard',
    path: '/dashboard',
    label: 'Dashboard',
    icon: 'dashboard',
    access: 'household',
    navigation: { section: 'primary', order: 0 },
    component: page(() => import('../pages/DashboardPage'), 'DashboardPage'),
  },
  {
    id: 'tutorials',
    path: '/tutorials',
    label: 'Tutorials',
    icon: 'activity',
    access: 'household',
    navigation: { section: 'settings', order: 100 },
    component: page(() => import('../pages/TutorialHubPage'), 'TutorialHubPage'),
  },
  {
    id: 'transactions',
    path: '/transactions',
    label: 'Transactions',
    icon: 'transactions',
    access: 'household',
    navigation: { section: 'primary', order: 10 },
    dashboard: {
      panelKey: 'transactions',
      panelLabel: 'Transactions',
      panelTitle: 'Official activity',
      panelDescription:
        'Search and correct approved household and personal transactions.',
      linkLabel: 'View transactions',
      defaultOrder: 10,
    },
    component: page(
      () => import('../pages/TransactionManagementPage'),
      'TransactionManagementPage',
    ),
  },
  {
    id: 'import',
    path: '/import',
    label: 'Import transactions',
    icon: 'import',
    access: 'household',
    navigation: { section: 'primary', order: 20 },
    dashboard: {
      panelKey: 'import-review',
      panelLabel: 'Import & Review',
      panelTitle: 'Bank transactions',
      panelDescription:
        'Upload CSV activity, then review it before creating transactions.',
      linkLabel: 'Import a CSV',
      defaultOrder: 20,
    },
    component: page(() => import('../pages/CsvImportPage'), 'CsvImportPage'),
  },
  {
    id: 'import-review',
    path: '/imports/review',
    label: 'Review imports',
    icon: 'review',
    access: 'household',
    navigation: { section: 'primary', order: 30 },
    dashboard: {
      panelKey: 'import-review',
      panelLabel: 'Import & Review',
      panelTitle: 'Bank transactions',
      panelDescription:
        'Upload CSV activity, then review it before creating transactions.',
      linkLabel: 'Review imports',
      defaultOrder: 20,
    },
    component: page(() => import('../pages/ImportReviewPage'), 'ImportReviewPage'),
  },
  {
    id: 'monthly-budget',
    path: '/budgeting',
    label: 'Monthly budget',
    icon: 'budget',
    access: 'household',
    navigation: { section: 'primary', order: 40 },
    dashboard: {
      panelKey: 'monthly-budget',
      panelLabel: 'Monthly Budget',
      panelTitle: 'Plan this month',
      panelDescription:
        'Review household or personal spending plans by category.',
      linkLabel: 'Manage budget',
      defaultOrder: 0,
    },
    component: page(
      () => import('../pages/BudgetManagementPage'),
      'BudgetManagementPage',
    ),
  },
  {
    id: 'annual-targets',
    path: '/budgeting/annual-targets',
    label: 'Annual targets',
    icon: 'budget',
    access: 'household',
    navigation: { section: 'primary', order: 45 },
    dashboard: {
      panelKey: 'annual-targets',
      panelLabel: 'Annual Targets',
      panelTitle: 'Plan the fiscal year',
      panelDescription:
        'Set annual category targets and create independent monthly drafts.',
      linkLabel: 'Manage annual targets',
    },
    component: page(
      () => import('../pages/YearlyPlanManagementPage'),
      'YearlyPlanManagementPage',
    ),
  },
  {
    id: 'annual-overview',
    path: '/budgeting/annual-overview',
    label: 'Annual overview',
    icon: 'activity',
    access: 'household',
    navigation: { section: 'primary', order: 47 },
    dashboard: {
      panelKey: 'annual-overview',
      panelLabel: 'Annual Overview',
      panelTitle: 'Review the year',
      panelDescription:
        'Compare monthly budgets, actual spending, income, and cash flow.',
      linkLabel: 'View annual overview',
    },
    component: page(
      () => import('../pages/AnnualBudgetOverviewPage'),
      'AnnualBudgetOverviewPage',
    ),
  },
  {
    id: 'recurring-expenses',
    path: '/budgeting/recurring-expenses',
    label: 'Recurring expenses',
    icon: 'recurring',
    access: 'household',
    navigation: { section: 'primary', order: 50 },
    dashboard: {
      panelKey: 'recurring-expenses',
      panelLabel: 'Recurring Expenses',
      panelTitle: 'Monthly expectations',
      panelDescription:
        'Maintain predictable expenses used to prepare future budgets.',
      linkLabel: 'Manage recurring expenses',
      defaultOrder: 30,
    },
    component: page(
      () => import('../pages/RecurringExpenseManagementPage'),
      'RecurringExpenseManagementPage',
    ),
  },
  {
    id: 'accounts',
    path: '/accounts',
    label: 'Accounts',
    icon: 'accounts',
    access: 'household',
    navigation: { section: 'primary', order: 60 },
    dashboard: {
      panelKey: 'accounts',
      panelLabel: 'Accounts',
      panelTitle: 'Financial accounts',
      panelDescription: 'Manage shared and personal transaction sources.',
      linkLabel: 'Manage accounts',
      defaultOrder: 40,
    },
    component: page(
      () => import('../pages/AccountManagementPage'),
      'AccountManagementPage',
    ),
  },
  {
    id: 'activity',
    path: '/activity',
    label: 'Activity',
    icon: 'activity',
    access: 'household',
    navigation: { section: 'primary', order: 70 },
    dashboard: {
      panelKey: 'activity',
      panelLabel: 'Activity',
      panelTitle: 'Household history',
      panelDescription:
        'Review meaningful household changes and your personal activity.',
      linkLabel: 'View activity',
    },
    component: page(() => import('../pages/ActivityPage'), 'ActivityPage'),
  },
  {
    id: 'household',
    path: '/household',
    label: 'Household',
    icon: 'household',
    access: 'household',
    navigation: { section: 'primary', order: 80 },
    dashboard: {
      panelKey: 'household',
      panelLabel: 'Household',
      panelTitle: 'Household details',
      panelDescription: 'Review household members and invitations.',
      linkLabel: 'Manage household',
      defaultOrder: 60,
    },
    component: page(
      () => import('../pages/HouseholdManagementPage'),
      'HouseholdManagementPage',
    ),
  },
  {
    id: 'categories',
    path: '/settings/categories',
    label: 'Categories',
    icon: 'categories',
    access: 'household',
    navigation: { section: 'settings', order: 10 },
    dashboard: {
      panelKey: 'categories',
      panelLabel: 'Categories',
      panelTitle: 'Household categories',
      panelDescription: 'Organize transactions and budget lines.',
      linkLabel: 'Manage categories',
      defaultOrder: 50,
    },
    component: page(
      () => import('../pages/CategoryManagementPage'),
      'CategoryManagementPage',
    ),
  },
  {
    id: 'categorization-rules',
    path: '/settings/categorization-rules',
    label: 'Categorization rules',
    icon: 'rules',
    access: 'household',
    navigation: { section: 'settings', order: 20 },
    dashboard: {
      panelKey: 'categorization-rules',
      panelLabel: 'Categorization Rules',
      panelTitle: 'Automatic categorization',
      panelDescription:
        'Manage predictable description rules used during import review.',
      linkLabel: 'Manage categorization rules',
    },
    component: page(
      () => import('../pages/CategorizationRuleManagementPage'),
      'CategorizationRuleManagementPage',
    ),
  },
  {
    id: 'import-profiles',
    path: '/settings/import-profiles',
    label: 'CSV profiles',
    icon: 'profiles',
    access: 'household',
    navigation: { section: 'settings', order: 30 },
    dashboard: {
      panelKey: 'import-profiles',
      panelLabel: 'CSV Profiles',
      panelTitle: 'Saved import structures',
      panelDescription:
        'Reuse mappings for bank and custom transaction file formats.',
      linkLabel: 'Manage CSV profiles',
    },
    component: page(
      () => import('../pages/ImportProfileManagementPage'),
      'ImportProfileManagementPage',
    ),
  },
]

export function navigationPages(section: NavigationSection) {
  return appPages
    .filter(pageDefinition =>
      pageDefinition.navigation?.section === section &&
      pageDefinition.icon)
    .sort((left, right) =>
      (left.navigation?.order ?? 0) - (right.navigation?.order ?? 0))
}

const pageDashboardPanels = new Map<string, DashboardPanelDefinition>()
for (const pageDefinition of appPages) {
  const shortcut = pageDefinition.dashboard
  if (!shortcut || !pageDefinition.icon) continue

  const existing = pageDashboardPanels.get(shortcut.panelKey)
  if (existing) {
    existing.links.push({
      label: shortcut.linkLabel,
      to: pageDefinition.path,
    })
    continue
  }

  pageDashboardPanels.set(shortcut.panelKey, {
    icon: pageDefinition.icon,
    key: shortcut.panelKey,
    label: shortcut.panelLabel,
    title: shortcut.panelTitle,
    description: shortcut.panelDescription,
    defaultOrder: shortcut.defaultOrder,
    links: [{
      label: shortcut.linkLabel,
      to: pageDefinition.path,
    }],
  })
}

export const dashboardPanels = [...pageDashboardPanels.values()]
  .sort((left, right) =>
    (left.defaultOrder ?? Number.MAX_SAFE_INTEGER) -
      (right.defaultOrder ?? Number.MAX_SAFE_INTEGER) ||
    left.label.localeCompare(right.label))

export const defaultDashboardPanelKeys = dashboardPanels
  .filter(panel => panel.defaultOrder !== undefined)
  .map(panel => panel.key)
