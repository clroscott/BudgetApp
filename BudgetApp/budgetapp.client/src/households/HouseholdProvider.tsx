import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '../auth/useAuth'
import { ApiError } from '../api/apiClient'
import { useReadOwner } from '../api/useReadOwner'
import { useRouter } from '../routing/useRouter'
import {
  createHousehold as createHouseholdRequest,
  getHouseholds,
  type CreateHouseholdRequest,
  type HouseholdMembership,
} from './householdApi'
import {
  HouseholdContext,
  type HouseholdContextValue,
} from './householdContext'

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { confirmNavigation } = useRouter()
  const [households, setHouseholds] = useState<HouseholdMembership[]>([])
  const [selectedHouseholdId, setSelectedHouseholdId] = useState<string | null>(
    null,
  )
  const selectedHouseholdIdRef = useRef<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [dataKey, setDataKey] = useState<string | null>(null)
  const [initializationError, setInitializationError] = useState<string | null>(null)
  const userId = user?.id
  const emailConfirmed = Boolean(user?.emailConfirmed)
  const contextKey = `${userId ?? 'signed-out'}/${emailConfirmed}`
  const reads = useReadOwner(contextKey)
  const selectionKey = useRef(contextKey)

  const storageKey = userId
    ? `budgetapp.selected-household.${userId}`
    : null

  const persistSelection = useCallback((householdId: string | null) => {
    if (!storageKey) return

    try {
      if (householdId) {
        localStorage.setItem(storageKey, householdId)
      } else {
        localStorage.removeItem(storageKey)
      }
    } catch {
      // Household switching still works when browser storage is unavailable.
    }
  }, [storageKey])

  const updateSelection = useCallback((householdId: string | null) => {
    selectedHouseholdIdRef.current = householdId
    setSelectedHouseholdId(householdId)
    persistSelection(householdId)
  }, [persistSelection])

  const refresh = useCallback(async (preferredHouseholdId?: string) => {
    const attempt = reads.begin()
    if (!attempt) return
    if (selectionKey.current !== contextKey) {
      selectionKey.current = contextKey
      selectedHouseholdIdRef.current = null
      setSelectedHouseholdId(null)
    }
    if (!emailConfirmed) {
      setHouseholds([])
      // Clear only in-memory views, not the user's saved household choice or any server data.
      selectedHouseholdIdRef.current = null
      setSelectedHouseholdId(null)
      setInitializationError(null)
      setIsLoading(false)
      setLoadedKey(contextKey)
      setDataKey(contextKey)
      attempt.finish()
      return
    }

    setIsLoading(true)
    setInitializationError(null)

    try {
      const memberships = await getHouseholds(attempt.signal)
      if (!attempt.isCurrent()) return
      setHouseholds(memberships)
      setDataKey(contextKey)
      if (
        preferredHouseholdId &&
        memberships.some(item => item.id === preferredHouseholdId)
      ) {
        updateSelection(preferredHouseholdId)
        return
      }

      const currentId = selectedHouseholdIdRef.current
      if (currentId && memberships.some(item => item.id === currentId)) {
        return
      }

      let storedId: string | null = null
      if (storageKey) {
        try {
          storedId = localStorage.getItem(storageKey)
        } catch {
          // Fall back to the first membership below.
        }
      }

      const nextId = storedId &&
        memberships.some(item => item.id === storedId)
        ? storedId
        : memberships[0]?.id ?? null
      updateSelection(nextId)
    } catch (error) {
      if (!attempt.isCurrent()) return
      if (error instanceof ApiError && [401, 403].includes(error.status)) {
        setHouseholds([])
        setDataKey(null)
        selectedHouseholdIdRef.current = null
        setSelectedHouseholdId(null)
      }
      setInitializationError(
        error instanceof Error ? error.message : 'Unable to load your household.',
      )
    } finally {
      if (attempt.isCurrent()) {
        setLoadedKey(contextKey)
        setIsLoading(false)
      }
      attempt.finish()
    }
  }, [contextKey, emailConfirmed, reads, storageKey, updateSelection])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const createHousehold = useCallback(
    async (request: CreateHouseholdRequest) => {
      const stillInContext = reads.captureContext()
      const household = await createHouseholdRequest(request)
      if (!stillInContext()) return household
      reads.invalidate()
      setHouseholds(current => [
        ...current.filter(item => item.id !== household.id),
        household,
      ].sort((left, right) => left.name.localeCompare(right.name)))
      updateSelection(household.id)
      setDataKey(contextKey)
      setLoadedKey(contextKey)
      setIsLoading(false)
      setInitializationError(null)
      return household
    },
    [contextKey, reads, updateSelection],
  )

  const selectHousehold = useCallback((householdId: string) => {
    if (!reads.isContextCurrent() || dataKey !== contextKey || !emailConfirmed || !households.some(item => item.id === householdId)) {
      return false
    }
    if (householdId === selectedHouseholdIdRef.current) return true
    if (!confirmNavigation()) return false
    updateSelection(householdId)
    return true
  }, [confirmNavigation, contextKey, dataKey, emailConfirmed, households, reads, updateSelection])

  const updateHousehold = useCallback((household: HouseholdMembership) => {
    if (!reads.isContextCurrent() || dataKey !== contextKey || !emailConfirmed) return
    reads.invalidate()
    setIsLoading(false)
    setHouseholds(current => current.map(item => item.id === household.id ? household : item)
      .sort((left, right) => left.name.localeCompare(right.name)))
  }, [contextKey, dataKey, emailConfirmed, reads])

  const visibleHouseholds = useMemo(() => emailConfirmed && dataKey === contextKey ? households : [],
    [contextKey, dataKey, emailConfirmed, households])
  const currentHousehold = visibleHouseholds.find(
    household => household.id === selectedHouseholdId,
  ) ?? visibleHouseholds[0] ?? null

  const value = useMemo<HouseholdContextValue>(() => ({
    households: visibleHouseholds,
    currentHousehold,
    isLoading: emailConfirmed && (isLoading || loadedKey !== contextKey),
    initializationError: loadedKey === contextKey ? initializationError : null,
    hasLoaded: dataKey === contextKey,
    selectHousehold,
    updateHousehold,
    createHousehold,
    refresh,
  }), [
    createHousehold,
    currentHousehold,
    visibleHouseholds,
    initializationError,
    isLoading,
    contextKey,
    dataKey,
    emailConfirmed,
    loadedKey,
    refresh,
    selectHousehold,
    updateHousehold,
  ])

  return (
    <HouseholdContext.Provider value={value}>
      {children}
    </HouseholdContext.Provider>
  )
}
