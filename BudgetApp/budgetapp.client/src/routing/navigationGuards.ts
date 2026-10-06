export type NavigationGuard = () => string | null

// Each editor owns its registration. A clean or unmounted editor cannot remove
// another editor's protection, and leaving a page asks only one question.
export function createNavigationGuards() {
  const guards = new Set<NavigationGuard>()
  const message = () => {
    const messages = [...new Set([...guards].map(guard => guard()).filter(
      (value): value is string => Boolean(value),
    ))]
    return messages.length ? messages.join('\n\n') : null
  }
  return {
    message,
    register(guard: NavigationGuard) {
      guards.add(guard)
      return () => { guards.delete(guard) }
    },
  }
}
