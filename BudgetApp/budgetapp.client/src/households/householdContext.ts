import { createContext } from 'react'
import type {
  CreateHouseholdRequest,
  HouseholdMembership,
} from './householdApi'

export interface HouseholdContextValue {
  households: HouseholdMembership[]
  currentHousehold: HouseholdMembership | null
  isLoading: boolean
  initializationError: string | null
  createInitialHousehold: (
    request: CreateHouseholdRequest,
  ) => Promise<HouseholdMembership>
  refresh: () => Promise<void>
}

export const HouseholdContext = createContext<HouseholdContextValue | null>(null)
