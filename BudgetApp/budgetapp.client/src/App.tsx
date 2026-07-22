import { useEffect, type ReactNode } from 'react'
import './App.css'
import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/useAuth'
import { HouseholdProvider } from './households/HouseholdProvider'
import { useHouseholds } from './households/useHouseholds'
import { DashboardPage } from './pages/DashboardPage'
import { CategoryManagementPage } from './pages/CategoryManagementPage'
import { HouseholdSetupPage } from './pages/HouseholdSetupPage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
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

  return currentHousehold ? children : <Redirect to="/household/setup" />
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
        <span className="brand-mark" aria-hidden="true">B</span>
        <p>{message}</p>
      </section>
    </main>
  )
}

function StatusError({ message, onRetry }: { message: string, onRetry: () => void }) {
  return (
    <main className="centered-page">
      <section className="status-card" role="alert">
        <span className="brand-mark" aria-hidden="true">B</span>
        <h1>BudgetApp is unavailable</h1>
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

  switch (path) {
    case '/':
      return <Redirect to="/dashboard" />
    case '/login':
      return (
        <AnonymousOnlyRoute>
          <LoginPage />
        </AnonymousOnlyRoute>
      )
    case '/register':
      return (
        <AnonymousOnlyRoute>
          <RegisterPage />
        </AnonymousOnlyRoute>
      )
    case '/dashboard':
      return (
        <ProtectedRoute>
          <HouseholdRequiredRoute>
            <DashboardPage />
          </HouseholdRequiredRoute>
        </ProtectedRoute>
      )
    case '/household/setup':
      return (
        <ProtectedRoute>
          <HouseholdSetupRoute>
            <HouseholdSetupPage />
          </HouseholdSetupRoute>
        </ProtectedRoute>
      )
    case '/settings/categories':
      return (
        <ProtectedRoute>
          <HouseholdRequiredRoute>
            <CategoryManagementPage />
          </HouseholdRequiredRoute>
        </ProtectedRoute>
      )
    default:
      return <Redirect to="/dashboard" />
  }
}

function App() {
  return (
    <RouterProvider>
      <AuthProvider>
        <HouseholdProvider>
          <AppRoutes />
        </HouseholdProvider>
      </AuthProvider>
    </RouterProvider>
  )
}

export default App
