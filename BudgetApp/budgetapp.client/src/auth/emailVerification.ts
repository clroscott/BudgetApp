export const verificationAccessPaths = new Set([
  '/login', '/register', '/forgot-password', '/reset-password',
  '/confirm-email', '/confirm-email-change', '/resend-confirmation', '/verify-email',
  '/settings/account',
])

export function emailVerificationPath(returnTo: string) {
  return `/verify-email?returnTo=${encodeURIComponent(returnTo)}`
}
