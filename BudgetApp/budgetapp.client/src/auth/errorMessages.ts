import { AuthApiError } from './authApi'

export function getErrorMessages(error: unknown): string[] {
  if (error instanceof AuthApiError) {
    return error.details.length > 0 ? error.details : [error.message]
  }

  return [error instanceof Error ? error.message : 'Something went wrong. Please try again.']
}
