import { useEffect } from 'react'
import { useRouter } from './useRouter'

export function useUnsavedChangesGuard(isDirty: boolean, message: string) {
  const { setNavigationBlocker } = useRouter()

  useEffect(() => {
    if (!isDirty) {
      setNavigationBlocker(null)
      return
    }

    const confirmNavigation = () => window.confirm(message)
    setNavigationBlocker(confirmNavigation)

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      setNavigationBlocker(null)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [isDirty, message, setNavigationBlocker])
}
