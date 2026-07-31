import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '../auth/useAuth'
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
  const [households, setHouseholds] = useState<HouseholdMembership[]>([])
  const [selectedHouseholdId, setSelectedHouseholdId] = useState<string | null>(
    null,
  )
  const selectedHouseholdIdRef = useRef<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null)
  const [initializationError, setInitializationError] = useState<string | null>(null)

  const storageKey = user
    ? `budgetapp.selected-household.${user.id}`
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
    if (!user) {
      setHouseholds([])
      updateSelection(null)
      setInitializationError(null)
      setIsLoading(false)
      setLoadedUserId(null)
      return
    }

    setIsLoading(true)
    setInitializationError(null)

    try {
      const memberships = await getHouseholds()
      setHouseholds(memberships)
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
      setInitializationError(
        error instanceof Error ? error.message : 'Unable to load your household.',
      )
    } finally {
      setLoadedUserId(user.id)
      setIsLoading(false)
    }
  }, [storageKey, updateSelection, user])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const createHousehold = useCallback(
    async (request: CreateHouseholdRequest) => {
      const household = await createHouseholdRequest(request)
      setHouseholds(current => [
        ...current.filter(item => item.id !== household.id),
        household,
      ].sort((left, right) => left.name.localeCompare(right.name)))
      updateSelection(household.id)
      return household
    },
    [updateSelection],
  )

  const selectHousehold = useCallback((householdId: string) => {
    if (!households.some(item => item.id === householdId)) {
      return
    }

    updateSelection(householdId)
  }, [households, updateSelection])

  const currentHousehold = households.find(
    household => household.id === selectedHouseholdId,
  ) ?? households[0] ?? null

  const value = useMemo<HouseholdContextValue>(() => ({
    households,
    currentHousehold,
    isLoading: isLoading || Boolean(user && loadedUserId !== user.id),
    initializationError,
    selectHousehold,
    createHousehold,
    refresh,
  }), [
    createHousehold,
    currentHousehold,
    households,
    initializationError,
    isLoading,
    loadedUserId,
    refresh,
    selectHousehold,
    user,
  ])

  return (
    <HouseholdContext.Provider value={value}>
      {children}
    </HouseholdContext.Provider>
  )
}
