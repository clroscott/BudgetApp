import { useEffect, useRef } from 'react'
import { sectionPages } from '../routing/navigationGroups'
import { AppLink } from '../routing/AppLink'

export function SectionNavigation({ section, currentPath, label }: {
  section: string, currentPath: string, label: string,
}) {
  const navRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    // Reveal the active tab inside its own scroll lane, without moving the page
    // or focus. Recheck when rotation/zoom changes the available width.
    const revealActive = () => {
      const active = nav.querySelector<HTMLElement>('[aria-current="page"]')
      if (!active || nav.scrollWidth <= nav.clientWidth) return
      const outer = nav.getBoundingClientRect(), inner = active.getBoundingClientRect()
      if (inner.left < outer.left) nav.scrollLeft -= outer.left - inner.left + 8
      else if (inner.right > outer.right) nav.scrollLeft += inner.right - outer.right + 8
    }
    revealActive()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(revealActive)
    observer?.observe(nav)
    window.addEventListener('resize', revealActive)
    return () => { observer?.disconnect(); window.removeEventListener('resize', revealActive) }
  }, [currentPath])
  return <nav ref={navRef} className="budgeting-section-nav section-navigation" aria-label={label}>
    {sectionPages(section).map(page => <AppLink key={page.id} to={page.path}
      aria-current={page.path === currentPath ? 'page' : undefined}
      className={page.path === currentPath ? 'active' : undefined}>{page.label}</AppLink>)}
  </nav>
}
