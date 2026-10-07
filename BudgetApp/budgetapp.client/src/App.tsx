import { Fragment, Suspense, useEffect, type ReactNode } from 'react'
import './App.css'
import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/useAuth'
import { emailVerificationPath, verificationAccessPaths } from './auth/emailVerification'
import { getSafeReturnPath } from './auth/returnPath'
import { BackToTopButton } from './components/BackToTopButton'
import { AppShell } from './components/AppShell'
import { BrandMark } from './components/Brand'
import { HouseholdProvider } from './households/HouseholdProvider'
import { useHouseholds } from './households/useHouseholds'
import { appPages } from './routing/pageRegistry'
import { RouterProvider } from './routing/RouterProvider'
import { PageNavigation } from './routing/PageNavigation'
import { useRouter } from './routing/useRouter'
import { TutorialProvider } from './tutorials/TutorialProvider'

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
  const requestedReturn = getSafeReturnPath()
  const returnPath = requestedReturn && !['/login', '/register'].includes(requestedReturn.split(/[?#]/)[0])
    ? requestedReturn : '/dashboard'

  return user
    ? <Redirect to={user.emailConfirmed || verificationAccessPaths.has(returnPath.split(/[?#]/)[0])
      ? returnPath : emailVerificationPath(returnPath)} />
    : children
}

function AccountRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { currentHousehold } = useHouseholds()
  if (!user) return <Redirect to={`/login?returnTo=${encodeURIComponent('/settings/account')}`} />
  const content = <Fragment key={user.id}>{children}</Fragment>
  // Account maintenance must not depend on household loading or membership.
  return <AppShell showHouseholdNavigation={user.emailConfirmed && Boolean(currentHousehold)}>{content}</AppShell>
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
    ? <AppShell><Fragment key={currentHousehold.id}>{children}</Fragment></AppShell>
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
  const { user, initializationError, isLoading, refresh } = useAuth()

  if (isLoading) {
    return <LoadingScreen message="Checking your session…" />
  }

  if (initializationError) {
    return <StatusError message={initializationError} onRetry={() => void refresh()} />
  }

  if (user && !user.emailConfirmed && !verificationAccessPaths.has(path)) {
    return <Redirect to={emailVerificationPath(path + window.location.search)} />
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

  if (page.access === 'public') {
    return content
  }

  if (page.access === 'account') return <AccountRoute>{content}</AccountRoute>

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
          <TutorialProvider>
            <PageNavigation><AppRoutes /></PageNavigation>
            <BackToTopButton />
          </TutorialProvider>
        </HouseholdProvider>
      </AuthProvider>
    </RouterProvider>
  )
}

export default App
