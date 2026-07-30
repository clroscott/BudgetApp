export function getSafeReturnPath(): string | null {
  const value = new URLSearchParams(window.location.search).get('returnTo')
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return null
  }

  return value
}
