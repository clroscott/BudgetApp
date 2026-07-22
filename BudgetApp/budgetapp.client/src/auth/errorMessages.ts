import { ApiError } from '../api/apiClient'

export function getErrorMessages(error: unknown): string[] {
  if (error instanceof ApiError) {
    return error.details.length > 0 ? error.details : [error.message]
  }

  return [error instanceof Error ? error.message : 'Something went wrong. Please try again.']
}
