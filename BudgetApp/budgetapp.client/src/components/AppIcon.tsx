export type AppIconName =
  | 'accounts'
  | 'budget'
  | 'categories'
  | 'dashboard'
  | 'household'
  | 'import'
  | 'profiles'
  | 'recurring'
  | 'review'
  | 'transactions'

const paths: Record<AppIconName, string[]> = {
  accounts: ['M4 7h16v12H4z', 'M4 10h16', 'M16 15h1'],
  budget: ['M12 2v20', 'M17 6.5c-1-1-2.5-1.5-5-1.5-3 0-5 1.5-5 3.5s2 3 5 3.5 5 1.5 5 3.5-2 3.5-5 3.5c-2.5 0-4-.5-5-1.5'],
  categories: ['M3 12l9-9h7v7l-9 9z', 'M16 7h.01'],
  dashboard: ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z'],
  household: ['M3 11l9-8 9 8', 'M5 10v11h14V10', 'M9 21v-6h6v6'],
  import: ['M12 3v12', 'M7 10l5 5 5-5', 'M4 20h16'],
  profiles: ['M4 6h10', 'M18 6h2', 'M4 12h2', 'M10 12h10', 'M4 18h7', 'M15 18h5', 'M14 4v4', 'M8 10v4', 'M13 16v4'],
  recurring: ['M17 2l3 3-3 3', 'M20 5H9a6 6 0 0 0-6 6', 'M7 22l-3-3 3-3', 'M4 19h11a6 6 0 0 0 6-6'],
  review: ['M5 3h14v18H5z', 'M8 10l2 2 5-5', 'M8 16h8'],
  transactions: ['M6 3h12v18l-3-2-3 2-3-2-3 2z', 'M9 8h6', 'M9 12h6'],
}

export function AppIcon({
  className,
  name,
}: {
  className?: string
  name: AppIconName
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name].map(path => <path d={path} key={path} />)}
    </svg>
  )
}
