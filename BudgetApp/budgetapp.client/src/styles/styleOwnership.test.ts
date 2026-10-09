/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import uploadPage from '../pages/CsvImportPage.tsx?raw'
import reviewPage from '../pages/ImportReviewPage.tsx?raw'
import transactionsPage from '../pages/TransactionManagementPage.tsx?raw'
import rulesPage from '../pages/CategorizationRuleManagementPage.tsx?raw'
import profilesPage from '../pages/ImportProfileManagementPage.tsx?raw'

// Vitest's default CSS transform replaces stylesheet imports (even ?raw) with
// empty modules. Read source explicitly: these ownership checks must inspect it.
const stylesheet = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const legacy = stylesheet('../App.css')
const shell = stylesheet('./shell.css')
const layout = stylesheet('./page-frame.css')
const transactions = stylesheet('./transactions.css')
const shared = stylesheet('./shared-controls.css')

describe('layout ownership regression guardrails', () => {
  it('keeps migrated shell and transaction/import selectors out of legacy CSS', () => {
    expect(legacy).not.toMatch(/\.(?:app-shell|app-sidebar|app-context-header|sidebar-|household-context-|profile-menu|transaction-|import-|csv-|rule-|page-title-row|management-content)/)
    expect(shell).not.toMatch(/\.management-content|\.transaction-|\.import-/)
    expect(transactions).not.toContain('--page-content-max:')
    expect(transactions).not.toContain('--page-content-gutter:')
  })
  it('centralizes page geometry, measured shell offsets and named overlay layers', () => {
    for (const token of ['--page-content-max', '--page-content-gutter', '--page-content-padding', '--layer-sidebar', '--layer-context-header', '--layer-tutorial']) expect(layout).toContain(token)
    expect(shell).toContain('top: var(--shell-context-top)')
    expect(shell).toContain('var(--shell-navigation-height, 0px)')
    expect(shared).toContain('var(--layer-skip-link)')
    expect(shared).toContain('var(--layer-back-to-top)')
  })
  it.each([['upload', uploadPage], ['review', reviewPage], ['transactions', transactionsPage], ['rules', rulesPage], ['profiles', profilesPage]])('uses PageFrame without a retired hidden header on %s', (_name, source) => {
    expect(source).toContain('<PageFrame')
    expect(source).not.toContain('className="app-header"')
    expect(source).not.toContain('className="management-content')
    expect(source).toContain('<TransactionsSectionNav')
  })
})
