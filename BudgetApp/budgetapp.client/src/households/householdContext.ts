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
  selectHousehold: (householdId: string) => boolean
  updateHousehold: (household: HouseholdMembership) => void
  createHousehold: (
    request: CreateHouseholdRequest,
  ) => Promise<HouseholdMembership>
  refresh: (preferredHouseholdId?: string) => Promise<void>
}

export const HouseholdContext = createContext<HouseholdContextValue | null>(null)
