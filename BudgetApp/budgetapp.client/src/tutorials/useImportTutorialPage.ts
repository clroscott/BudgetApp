import { useContext, useLayoutEffect, useState } from 'react'
import { ImportTutorialPageContext, importTutorialKey, type ImportTutorialPage } from './importTutorialState'
import { TutorialContext } from './tutorialContext'

export function useImportTutorialPage(page: ImportTutorialPage | null) {
  const publish = useContext(ImportTutorialPageContext)
  const active = [importTutorialKey, 'categorize-transactions', 'fix-mistaken-import', 'resolve-import-problems'].includes(useContext(TutorialContext)?.activeTutorial?.key ?? '')
  const [owner] = useState(() => Symbol('import tutorial page'))
  // Small scalar projection only: avoid registering anew on every page render.
  const key = JSON.stringify(active ? page : null)
  useLayoutEffect(() => { publish?.(owner, JSON.parse(key) as ImportTutorialPage | null) }, [publish, owner, key])
  useLayoutEffect(() => () => publish?.(owner, null), [publish, owner])
}
