import { Suspense, useEffect, type ReactNode } from 'react'
import './App.css'
import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/useAuth'
import { BackToTopButton } from './components/BackToTopButton'
import { AppShell } from './components/AppShell'
import { BrandMark } from './components/Brand'
import { HouseholdProvider } from './households/HouseholdProvider'
import { useHouseholds } from './households/useHouseholds'
import { appPages } from './routing/pageRegistry'
import { RouterProvider } from './routing/RouterProvider'
import { useRouter } from './routing/useRouter'

function Redirect({ to }: { to: string }) {
  const { navigate } = useRouter()

  useEffect(() => {
    navigate(to, { replace: true })
  }, [navigate, to])

  return <LoadingScreen message="Redirecting…" />
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth()

  return user ? children : <Redirect to="/login" />
}

function AnonymousOnlyRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth()

  return user ? <Redirect to="/dashboard" /> : children
}

function HouseholdRequiredRoute({ children }: { children: ReactNode }) {
  const {
    currentHousehold,
    initializationError,
    isLoading,
    refresh,
  } = useHouseholds()

  if (isLoading) {
    return <LoadingScreen message="Loading your household..." />
  }

  if (initializationError) {
    return (
      <StatusError
        message={initializationError}
        onRetry={() => void refresh()}
      />
    )
  }

  return currentHousehold
    ? <AppShell>{children}</AppShell>
    : <Redirect to="/household/setup" />
}

function HouseholdSetupRoute({ children }: { children: ReactNode }) {
  const {
    currentHousehold,
    initializationError,
    isLoading,
    refresh,
  } = useHouseholds()

  if (isLoading) {
    return <LoadingScreen message="Checking household setup..." />
  }

  if (initializationError) {
    return (
      <StatusError
        message={initializationError}
        onRetry={() => void refresh()}
      />
    )
  }

  return currentHousehold ? <Redirect to="/dashboard" /> : children
}

function LoadingScreen({ message }: { message: string }) {
  return (
    <main className="centered-page" aria-busy="true">
      <section className="status-card">
        <BrandMark />
        <p>{message}</p>
      </section>
    </main>
  )
}

function StatusError({ message, onRetry }: { message: string, onRetry: () => void }) {
  return (
    <main className="centered-page">
      <section className="status-card" role="alert">
        <BrandMark />
        <h1>MC Budget is unavailable</h1>
        <p>{message}</p>
        <button type="button" onClick={onRetry}>Try again</button>
      </section>
    </main>
  )
}

function AppRoutes() {
  const { path } = useRouter()
  const { initializationError, isLoading, refresh } = useAuth()

  if (isLoading) {
    return <LoadingScreen message="Checking your session…" />
  }

  if (initializationError) {
    return <StatusError message={initializationError} onRetry={() => void refresh()} />
  }

  if (path === '/') {
    return <Redirect to="/dashboard" />
  }

  const page = appPages.find(candidate => candidate.path === path)
  if (!page) {
    return <Redirect to="/dashboard" />
  }

  const PageComponent = page.component
  const content = (
    <Suspense fallback={<LoadingScreen message={`Loading ${page.label}...`} />}>
      <PageComponent />
    </Suspense>
  )

  if (page.access === 'anonymous') {
    return <AnonymousOnlyRoute>{content}</AnonymousOnlyRoute>
  }

  if (page.access === 'household-setup') {
    return (
      <ProtectedRoute>
        <HouseholdSetupRoute>{content}</HouseholdSetupRoute>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <HouseholdRequiredRoute>{content}</HouseholdRequiredRoute>
    </ProtectedRoute>
  )
}

function App() {
  useEffect(() => {
    const stopNumberWheelChanges = (event: WheelEvent) => {
      const target = event.target
      if (
        target instanceof HTMLInputElement &&
        target.type === 'number' &&
        document.activeElement === target
      ) {
        target.blur()
      }
    }

    document.addEventListener('wheel', stopNumberWheelChanges, {
      capture: true,
      passive: true,
    })
    return () => document.removeEventListener(
      'wheel',
      stopNumberWheelChanges,
      { capture: true },
    )
  }, [])

  return (
    <RouterProvider>
      <AuthProvider>
        <HouseholdProvider>
          <AppRoutes />
          <BackToTopButton />
        </HouseholdProvider>
      </AuthProvider>
    </RouterProvider>
  )
}

export default App
