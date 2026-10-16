import { useContext, useLayoutEffect, useState } from 'react'
import { ImportTutorialPageContext, type ImportTutorialPage } from './importTutorialState'

export function useImportTutorialPage(page: ImportTutorialPage | null) {
  const publish = useContext(ImportTutorialPageContext)
  const [owner] = useState(() => Symbol('import tutorial page'))
  // Small scalar projection only: avoid registering anew on every page render.
  const key = JSON.stringify(page)
  useLayoutEffect(() => { publish?.(owner, JSON.parse(key) as ImportTutorialPage | null) }, [publish, owner, key])
  useLayoutEffect(() => () => publish?.(owner, null), [publish, owner])
}
