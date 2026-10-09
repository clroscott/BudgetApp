import type { ComponentPropsWithRef, ReactNode } from 'react'

// AppShell owns household/profile context. PageFrame owns the main landmark and
// content column; pages supply their existing section navigation, title and UI.
export function PageFrame({ children, contentClassName = '', className = '', footer, ...mainProps }: ComponentPropsWithRef<'main'> & {
  children: ReactNode
  contentClassName?: string
  footer?: ReactNode
}) {
  return <main {...mainProps} className={`page-frame${className ? ` ${className}` : ''}`}>
    <section className={`page-frame-content${contentClassName ? ` ${contentClassName}` : ''}`}>
      {children}
    </section>
    {footer}
  </main>
}
