import type { ReactNode, Ref } from 'react'

// AppShell owns household/profile context. PageFrame owns the main landmark and
// content column; pages supply their existing section navigation, title and UI.
export function PageFrame({ children, contentClassName = '', className = '', ref, footer }: {
  children: ReactNode
  contentClassName?: string
  className?: string
  ref?: Ref<HTMLElement>
  footer?: ReactNode
}) {
  return <main className={`page-frame${className ? ` ${className}` : ''}`} ref={ref}>
    <section className={`page-frame-content${contentClassName ? ` ${contentClassName}` : ''}`}>
      {children}
    </section>
    {footer}
  </main>
}
