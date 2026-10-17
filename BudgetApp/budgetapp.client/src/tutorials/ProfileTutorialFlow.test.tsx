import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/authContext'
import { HouseholdContext } from '../households/householdContext'
import { authFixture, householdsFixture } from '../test/fixtures'
import { RouterProvider } from '../routing/RouterProvider'
import { useRouter } from '../routing/useRouter'
import { AppLink } from '../routing/AppLink'
import { ImportProfileManagementPage } from '../pages/ImportProfileManagementPage'
import { CsvImportPage } from '../pages/CsvImportPage'
import { TutorialHubPage } from '../pages/TutorialHubPage'
import { getAccounts } from '../accounts/accountApi'
import { getImportProfiles, createImportProfile, updateImportProfile, inspectImportFile, deleteImportProfile, setImportProfileActive, type ImportProfile } from '../imports/importProfileApi'
import { uploadCsvImport, completeImport } from '../imports/importApi'
import { getTutorialProgress, saveTutorialProgress } from './tutorialProgressApi'
import { TutorialProvider } from './TutorialProvider'
import { useTutorials } from './useTutorials'
import { mockTutorialLayout, restoreTutorialLayout } from './tutorialTestSupport'
import { profileTutorialGate, type ProfileTutorialPage } from './profileTutorialState'
import { deferred } from '../test/deferred'

vi.mock('../accounts/accountApi', () => ({ getAccounts: vi.fn() }))
vi.mock('../imports/importProfileApi', async original => ({ ...await original<typeof import('../imports/importProfileApi')>(),
  getImportProfiles: vi.fn(), createImportProfile: vi.fn(), updateImportProfile: vi.fn(), inspectImportFile: vi.fn(), deleteImportProfile: vi.fn(), setImportProfileActive: vi.fn() }))
vi.mock('../imports/importApi', async original => ({ ...await original<typeof import('../imports/importApi')>(), uploadCsvImport: vi.fn(), completeImport: vi.fn() }))
vi.mock('./tutorialProgressApi', () => ({ getTutorialProgress: vi.fn(), saveTutorialProgress: vi.fn() }))
const sample: ImportProfile = { id: 'profile-a', name: 'Sample mapping', headers: ['Date', 'Description', 'Amount'], dateColumn: 'Date', descriptionColumn: 'Description',
  amountColumn: 'Amount', debitColumn: null, creditColumn: null, categoryColumn: null, subcategoryColumn: null, amountConvention: 'SpendingPositive',
  defaultAccountId: null, isActive: true, dateFormat: null, numberCulture: null }
let profiles: ImportProfile[]
function Routes() {
  const { path } = useRouter(); const tutorials = useTutorials()
  return <>{path === '/settings/import-profiles' ? <><ImportProfileManagementPage /><AppLink to="/tutorials">Leave profiles</AppLink></>
    : path === '/import' ? <CsvImportPage /> : <TutorialHubPage />}
    <output data-testid="step">{tutorials.activeTutorial ? `${tutorials.activeTutorial.key}:${tutorials.activeStepIndex}` : 'inactive'}</output>
  </>
}
function show(role: 'Owner' | 'Viewer' = 'Owner') {
  window.history.replaceState(null, '', '/tutorials'); const households = householdsFixture()
  households.currentHousehold = { ...households.currentHousehold!, role }
  render(<AuthContext.Provider value={authFixture()}><RouterProvider><HouseholdContext.Provider value={households}>
    <TutorialProvider><Routes /></TutorialProvider>
  </HouseholdContext.Provider></RouterProvider></AuthContext.Provider>)
}
const guide = () => screen.getByRole('region', { name: 'Reuse CSV and Excel mappings tutorial controls' })
async function click(name: string) {
  const button = within(guide()).getByRole('button', { name }) as HTMLButtonElement
  await waitFor(() => expect(button.disabled).toBe(false)); fireEvent.click(button)
}
async function step(index: number) { await waitFor(() => expect(screen.getByTestId('step').textContent).toBe(`manage-import-profiles:${index}`)) }
async function start(selection = 'profile-a') {
  const card = screen.getByRole('heading', { name: 'Reuse CSV and Excel mappings' }).closest('article')!
  const startButton = within(card).getByRole('button', { name: 'Start tutorial' }) as HTMLButtonElement
  await waitFor(() => expect(startButton.disabled).toBe(false)); fireEvent.click(startButton); await step(0)
  const select = await screen.findByLabelText('Profile for this tutorial') as HTMLSelectElement
  await waitFor(() => expect(select.disabled).toBe(false)); fireEvent.change(select, { target: { value: selection } })
  await click('Use this mapping'); await step(1)
}
async function toSave() { await click('Next'); await click('Next'); await click('Next'); await step(4) }
async function chooseSaved(id = 'profile-a') {
  await click('Next'); await step(5)
  const select = await screen.findByLabelText(/Import profile/) as HTMLSelectElement
  await waitFor(() => expect(select.disabled).toBe(false)); fireEvent.change(select, { target: { value: id } })
  await click('Next'); await step(6)
}
function noImportWrites() { for (const command of [inspectImportFile, uploadCsvImport, completeImport, deleteImportProfile, setImportProfileActive]) expect(command).not.toHaveBeenCalled() }
beforeEach(() => {
  vi.clearAllMocks(); mockTutorialLayout(); profiles = [structuredClone(sample)]
  vi.mocked(getImportProfiles).mockImplementation(async () => structuredClone(profiles))
  vi.mocked(getAccounts).mockResolvedValue([{ id: 'account-a', name: 'My account', type: 'Chequing', scope: 'Personal', ownerUserId: 'test-user',
    currency: 'CAD', institutionName: null, lastFourDigits: null, isActive: true }])
  vi.mocked(createImportProfile).mockImplementation(async (_hh, request) => { const saved = { ...request, id: 'created-profile', isActive: true }; profiles.push(saved); return saved })
  vi.mocked(updateImportProfile).mockImplementation(async (_hh, id, request) => { const saved = { ...request, id, isActive: true }; profiles = profiles.map(profile => profile.id === id ? saved : profile); return saved })
  vi.mocked(getTutorialProgress).mockResolvedValue([])
  vi.mocked(saveTutorialProgress).mockImplementation(async (tutorialKey, tutorialVersion, status, currentStepIndex) => ({
    tutorialKey, tutorialVersion, status, currentStepIndex, startedAtUtc: '', updatedAtUtc: '', completedAtUtc: null, dismissedAtUtc: null }))
})
afterEach(restoreTutorialLayout)
describe('Reusable import-profile guided setup', () => {
  it.each(['Owner', 'Viewer'] as const)('uses an existing %s mapping without a required save, inspection or upload', async role => {
    profiles[0].defaultAccountId = 'private-hidden-account'
    show(role); await start(); await toSave()
    if (role === 'Owner') fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    else { expect(screen.queryByLabelText('Profile name')).toBeNull(); expect(screen.getByText(/Not available to your account/)).toBeTruthy() }
    await chooseSaved(); await click('Continue importing')
    await waitFor(() => expect(saveTutorialProgress).toHaveBeenLastCalledWith('manage-import-profiles', 1, 'Completed', 6))
    expect(window.location.pathname).toBe('/import'); expect(createImportProfile).not.toHaveBeenCalled(); expect(updateImportProfile).not.toHaveBeenCalled(); noImportWrites()
  })
  it('saves a new localized profile only on the page action, then offers an explicit separate import guide', async () => {
    show(); await start('new'); fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'My bank structure' } })
    await click('Next'); await click('Next')
    fireEvent.change(screen.getByLabelText('Text date format'), { target: { value: 'dd/MM/yyyy' } })
    fireEvent.change(screen.getByLabelText('Text number format'), { target: { value: 'de-DE' } })
    await click('Next'); expect(createImportProfile).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Create profile' }))
    await chooseSaved('created-profile')
    expect(createImportProfile).toHaveBeenCalledExactlyOnceWith('household-a', expect.objectContaining({ name: 'My bank structure', dateFormat: 'dd/MM/yyyy', numberCulture: 'de-DE' }))
    noImportWrites(); fireEvent.click(within(guide()).getByText('More details')); await click('Start import tutorial')
    await waitFor(() => expect(screen.getByTestId('step').textContent).toBe('import-review:0')); noImportWrites()
  })
  it('edits debit/credit mappings and signs without silently switching layouts or saving', async () => {
    profiles[0] = { ...sample, headers: ['Date', 'Description', 'Paid', 'Received'], amountColumn: null, debitColumn: 'Paid', creditColumn: 'Received' }
    show(); await start(); expect(screen.queryByText('In the single amount column, what does a positive number mean?')).toBeNull()
    fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Updated structure' } }); await toSave()
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' })); await chooseSaved(); await click('Return to tutorials')
    expect(updateImportProfile).toHaveBeenCalledExactlyOnceWith('household-a', 'profile-a', expect.objectContaining({ debitColumn: 'Paid', creditColumn: 'Received', amountColumn: null }))
    noImportWrites()
  })
  it('returns from Import to the same just-saved profile without enabling another create', async () => {
    show(); await start('new'); fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Keep this mapping' } }); await toSave()
    fireEvent.click(screen.getByRole('button', { name: 'Create profile' })); await chooseSaved('created-profile')
    await click('Back'); await click('Back'); await step(4)
    expect((await screen.findByLabelText('Profile for this tutorial') as HTMLSelectElement).value).toBe('new')
    expect((screen.getByRole('button', { name: 'Create profile' }) as HTMLButtonElement).disabled).toBe(true)
    await chooseSaved('created-profile'); await click('Continue importing')
    expect(createImportProfile).toHaveBeenCalledOnce(); expect(updateImportProfile).not.toHaveBeenCalled(); noImportWrites()
  })
  it('recovers a lost create reply by selecting the saved mapping, without adding it twice', async () => {
    show(); await start('new'); fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Lost reply mapping' } }); await toSave()
    vi.mocked(createImportProfile).mockImplementationOnce(async (_hh, request) => { profiles.push({ ...request, id: 'lost-profile', isActive: true }); throw new Error('Lost reply') })
    fireEvent.click(screen.getByRole('button', { name: 'Create profile' })); await screen.findByRole('button', { name: 'Check saved profiles' })
    expect((screen.getByLabelText('Profile for this tutorial') as HTMLSelectElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Check saved profiles' }))
    expect((screen.getByRole('button', { name: 'Create profile' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(within(guide()).getByText('More details')); await click('Restart task selection'); await step(0)
    vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.change(screen.getByLabelText('Profile for this tutorial'), { target: { value: 'lost-profile' } }); await click('Use this mapping'); await toSave()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); await chooseSaved('lost-profile'); await click('Continue importing')
    expect(createImportProfile).toHaveBeenCalledOnce(); expect(window.confirm).toHaveBeenCalledOnce(); expect(updateImportProfile).not.toHaveBeenCalled(); noImportWrites()
  })
  it('keeps failed reads distinct from no profiles and retains dirty edits after Escape', async () => {
    const pending = deferred<ImportProfile[]>(); vi.mocked(getImportProfiles).mockReturnValueOnce(pending.promise)
    show(); const card = screen.getByRole('heading', { name: 'Reuse CSV and Excel mappings' }).closest('article')!
    const launch = within(card).getByRole('button', { name: 'Start tutorial' }) as HTMLButtonElement
    await waitFor(() => expect(launch.disabled).toBe(false)); fireEvent.click(launch); await step(0)
    await act(async () => pending.reject(new Error('Synthetic profile read failure')))
    expect(screen.queryByText('No active import profiles.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading' })); await screen.findByLabelText('Profile name')
    fireEvent.change(screen.getByLabelText('Profile for this tutorial'), { target: { value: 'new' } }); await click('Use this mapping')
    fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Keep draft mapping' } })
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' }); expect((screen.getByLabelText('Profile name') as HTMLInputElement).value).toBe('Keep draft mapping')
    fireEvent.click(screen.getByRole('link', { name: 'Leave profiles' })); expect(window.confirm).toHaveBeenCalled(); expect(window.location.pathname).toBe('/settings/import-profiles')
    expect(createImportProfile).not.toHaveBeenCalled(); noImportWrites()
  })
  it('binds profile/context and rejects stale, dirty or uncertain save outcomes', () => {
    const page: ProfileTutorialPage = { page: 'profiles', householdId: 'hh', fresh: true, busy: false, dirty: false, uncertain: false,
      selection: 'a', profileId: 'a', editing: false, canEdit: true }
    const task = { householdId: 'hh', role: 'Owner', selection: 'a', profileId: 'a' }
    expect(profileTutorialGate(4, 'hh', 'Owner', task, page).canNext).toBe(true)
    for (const changed of [{ fresh: false }, { busy: true }, { uncertain: true }, { dirty: true }, { selection: 'other' }, { profileId: null }])
      expect(profileTutorialGate(4, 'hh', 'Owner', task, { ...page, ...changed }).canNext).toBe(false)
    expect(profileTutorialGate(4, 'hh', 'Viewer', task, page).canNext).toBe(false)
    expect(profileTutorialGate(4, 'other', 'Owner', task, page).canNext).toBe(false)
    expect(profileTutorialGate(5, 'hh', 'Owner', task, { ...page, page: 'upload', profileId: 'other' }).canNext).toBe(false)
  })
})
