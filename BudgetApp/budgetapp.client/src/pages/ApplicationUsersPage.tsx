import { useEffect, useId, useState, type FormEvent } from 'react'
import { getApplicationUsers, type AdministratorList } from '../administration/administrationApi'
import { useAuth } from '../auth/useAuth'
import { ApplicationAdministrationNav } from '../components/ApplicationAdministrationNav'
import { PageLoadFeedback } from '../components/PageLoadFeedback'
import { AppLink } from '../routing/AppLink'
import { usePageLoad } from './usePageLoad'

export function ApplicationUsersPage() {
  const { user } = useAuth()
  if (!user?.isApplicationAdministrator || !user.loginVerificationEnabled) return <main className="management-page"><section className="management-content">
    <h1>Application users</h1><p role="alert">Application-administrator access and an MFA sign-in are required to view users. Household administrator roles do not grant this access.</p>
    <AppLink to="/settings/account">Account settings</AppLink></section></main>
  return <UserDirectory />
}
function UserDirectory() {
  const id = useId()
  const { user } = useAuth()
  const [filter, setFilter] = useState('')
  const [query, setQuery] = useState({ page: 1, search: '' })
  const [directory, setDirectory] = useState<AdministratorList | null>(null)
  const load = usePageLoad(`application-users:${query.page}:${query.search}`)
  const run = load.run
  useEffect(() => { void run(() => getApplicationUsers(query.page, query.search), setDirectory) }, [query, run])
  const refresh = () => { void run(() => getApplicationUsers(query.page, query.search), setDirectory) }
  const applyFilter = (event: FormEvent) => { event.preventDefault(); setQuery({ page: 1, search: filter.trim() }) }
  return <main className="management-page"><section className="management-content">
    <header><p className="eyebrow">Application administration · account directory</p><h1>Application users</h1>
      <p>Browse existing accounts without searching first. Only basic account and security status is shown—not household memberships, budgets or transactions.</p></header>
    <ApplicationAdministrationNav />
    <form className="admin-users-filter" aria-label="Filter application users" onSubmit={applyFilter}>
      <div><label htmlFor={`${id}-filter`}>Filter by name or email (optional)</label><input id={`${id}-filter`} maxLength={256} value={filter} onChange={event => setFilter(event.target.value)} /></div>
      <button type="submit" className="secondary-button">Apply filter</button>
      <button type="button" className="text-button" onClick={() => { setFilter(''); setQuery({ page: 1, search: '' }) }}>Show all users</button>
    </form>
    {query.search && <p className="field-help">Applied filter: {query.search}</p>}
    <PageLoadFeedback subject="application users" status={load.status} errors={load.errors} onReload={refresh} />
    {load.hasData && directory && <>
      <p role="status">{directory.totalCount} {directory.totalCount === 1 ? 'user' : 'users'}{query.search ? ' matching the filter' : ' registered'} · Page {directory.page} of {Math.max(1, Math.ceil(directory.totalCount / directory.pageSize))}</p>
      {load.isFresh && directory.items.length === 0 && <p>{directory.totalCount > 0 ? 'No users on this page. Go back to the previous page or refresh the list.' : query.search ? 'No users match this filter.' : 'No registered users were returned.'}</p>}
      <ul className="admin-users-list" aria-label="Registered application users">{directory.items.map(account => <li key={account.id} className="account-settings-card">
        <div className="admin-user-identity"><h2>{account.displayName}</h2><p>{account.email}</p>{account.id === user?.id && <span className="field-help">Your account</span>}</div>
        <dl className="admin-user-details">
          <div><dt>Email ownership</dt><dd>{account.emailConfirmed ? 'Verified' : 'Not verified'}</dd></div>
          <div><dt>MFA</dt><dd>{account.mfaEnabled ? 'On' : 'Off'}</dd></div>
          <div><dt>Application access</dt><dd>{account.administratorRole === 'InstallationOwner' ? 'Installation owner' : account.administratorRole === 'SupportAdministrator' ? 'Support administrator' : 'No administrator access'}</dd></div>
          <div><dt>Sign-in status</dt><dd>{account.lockedUntilUtc ? `Locked until ${new Date(account.lockedUntilUtc).toLocaleString()}` : 'Not locked'}</dd></div>
        </dl>
        <div className="admin-user-actions">{load.isFresh ? <>
          <AppLink className="secondary-button" to={`/admin?account=${encodeURIComponent(account.id)}`} aria-label={`Account support for ${account.email}`}>Account support</AppLink>
          {user?.isApplicationOwner && <AppLink className="text-button" to={`/admin/administrators?account=${encodeURIComponent(account.id)}`} aria-label={`Manage administrator access for ${account.email}`}>Manage administrator access</AppLink>}
        </> : <p className="field-help">Refresh the list before opening this account.</p>}</div>
      </li>)}</ul>
      <nav className="household-settings-actions" aria-label="User list pages">
        <button type="button" disabled={!load.isFresh || directory.page <= 1} onClick={() => setQuery({ ...query, page: directory.page - 1 })}>Previous users page</button>
        <span>20 users per page</span>
        <button type="button" disabled={!load.isFresh || directory.page * directory.pageSize >= directory.totalCount} onClick={() => setQuery({ ...query, page: directory.page + 1 })}>Next users page</button>
      </nav>
    </>}
  </section></main>
}
