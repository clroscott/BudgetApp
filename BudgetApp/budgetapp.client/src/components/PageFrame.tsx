import type { ReactNode } from 'react'

// AppShell owns household/profile context. PageFrame owns the main landmark and
// content column; pages supply their existing section navigation, title and UI.
export function PageFrame({ children, contentClassName = '' }: {
  children: ReactNode
  contentClassName?: string
}) {
  return <main className="page-frame">
    <section className={`page-frame-content${contentClassName ? ` ${contentClassName}` : ''}`}>
      {children}
    </section>
  </main>
}
