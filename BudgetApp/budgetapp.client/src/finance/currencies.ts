export const currencies = typeof Intl.supportedValuesOf === 'function'
  ? Intl.supportedValuesOf('currency')
  : ['CAD', 'USD']
