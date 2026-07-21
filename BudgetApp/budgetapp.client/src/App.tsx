import { useEffect, type ReactNode } from 'react'
import './App.css'
import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/useAuth'
import { DashboardPage } from './pages/DashboardPage'
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

function AppRoutes() {
  const { path } = useRouter()
  const { initializationError, isLoading, refresh } = useAuth()

  if (isLoading) {
    return <LoadingScreen message="Checking your session…" />
  }

  if (initializationError) {
    return (
      <main className="centered-page">
        <section className="status-card" role="alert">
          <span className="brand-mark" aria-hidden="true">B</span>
          <h1>BudgetApp is unavailable</h1>
          <p>{initializationError}</p>
          <button type="button" onClick={() => void refresh()}>
            Try again
          </button>
        </section>
      </main>
    )
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
          <DashboardPage />
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
        <AppRoutes />
      </AuthProvider>
    </RouterProvider>
  )
}

export default App
