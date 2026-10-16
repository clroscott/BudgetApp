import { useEffect, useState } from 'react'

// The page host reserves scroll space below the fixed companion. A missing
// host leaves the coach available for recovery/exit without observing other pages.
export function useTutorialHost(active: boolean) {
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (!active) return
    const check = () => {
      const next = document.getElementById('import-tutorial-guide-host')
      setHost(current => current === next ? current : next)
    }
    const observer = new MutationObserver(check)
    observer.observe(document.body, { childList: true, subtree: true })
    check()
    return () => observer.disconnect()
  }, [active])
  return active && host?.isConnected ? host : null
}
