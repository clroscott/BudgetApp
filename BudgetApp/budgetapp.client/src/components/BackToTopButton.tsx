import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from '../routing/useRouter'

export function BackToTopButton() {
  const { path } = useRouter()
  const [isVisible, setIsVisible] = useState(false)
  const [scrollRegion, setScrollRegion] = useState<HTMLElement | null>(null)
  const [buttonHost, setButtonHost] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const region = document.querySelector<HTMLElement>('[data-back-to-top-scroll-region]')
    const host = document.querySelector<HTMLElement>('[data-back-to-top-host]')
    setScrollRegion(region)
    setButtonHost(host)

    const updateVisibility = () => setIsVisible(
      region ? region.scrollTop > 400 : window.scrollY > 400,
    )
    updateVisibility()
    const target: Window | HTMLElement = region ?? window
    target.addEventListener('scroll', updateVisibility, { passive: true })
    return () => target.removeEventListener('scroll', updateVisibility)
  }, [path])

  if (!isVisible) return null

  const button = (
    <button
      className="back-to-top-button"
      type="button"
      onClick={() => (scrollRegion ?? window).scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Back to top"
    >
      <span aria-hidden="true">&uarr;</span> Back to top
    </button>
  )

  return buttonHost ? createPortal(button, buttonHost) : button
}
