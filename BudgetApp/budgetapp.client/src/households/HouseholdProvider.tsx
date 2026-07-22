import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '../auth/useAuth'
import {
  createHousehold,
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
  const [isLoading, setIsLoading] = useState(false)
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null)
  const [initializationError, setInitializationError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!user) {
      setHouseholds([])
      setInitializationError(null)
      setIsLoading(false)
      setLoadedUserId(null)
      return
    }

    setIsLoading(true)
    setInitializationError(null)

    try {
      setHouseholds(await getHouseholds())
    } catch (error) {
      setInitializationError(
        error instanceof Error ? error.message : 'Unable to load your household.',
      )
    } finally {
      setLoadedUserId(user.id)
      setIsLoading(false)
    }
  }, [user])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const createInitialHousehold = useCallback(
    async (request: CreateHouseholdRequest) => {
      const household = await createHousehold(request)
      setHouseholds([household])
      return household
    },
    [],
  )

  const value = useMemo<HouseholdContextValue>(() => ({
    households,
    currentHousehold: households[0] ?? null,
    isLoading: isLoading || Boolean(user && loadedUserId !== user.id),
    initializationError,
    createInitialHousehold,
    refresh,
  }), [
    createInitialHousehold,
    households,
    initializationError,
    isLoading,
    loadedUserId,
    refresh,
    user,
  ])

  return (
    <HouseholdContext.Provider value={value}>
      {children}
    </HouseholdContext.Provider>
  )
}
