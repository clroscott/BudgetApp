export function timeZoneOptions(current: string): string[] {
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  return [...new Set([current, 'UTC', ...zones].filter(Boolean))]
}
