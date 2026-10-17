// Browser-intercepted disposable file/row data only. No live uploads or records.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { responseFor, importId, draftPageFor } from './fixtures.mjs'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), client = resolve(root, 'BudgetApp/budgetapp.client')
const require = createRequire(resolve(client, 'package.json'))
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href)
const react = (await import(pathToFileURL(require.resolve('@vitejs/plugin-react')).href)).default
const { chromium } = await import(process.env.BUDGETAPP_QA_PLAYWRIGHT_PATH ? pathToFileURL(process.env.BUDGETAPP_QA_PLAYWRIGHT_PATH).href : 'playwright')
const output = resolve(root, 'artifacts/import-problems-tutorial-qa'); await mkdir(output, { recursive: true })
const server = await createServer({ root: client, configFile: false, plugins: [react()], server: { host: '127.0.0.1', port: 4204, strictPort: true } })
const results = [], errors = []; let browser
try {
  await server.listen(); browser = await chromium.launch({ headless: true, ...(process.env.BUDGETAPP_QA_BROWSER_PATH ? { executablePath: process.env.BUDGETAPP_QA_BROWSER_PATH } : {}) })
  for (const width of [1440, 390, 320]) for (const scenario of ['inspect', 'staged', 'viewer', 'csv', 'xlsx', 'duplicate-file', 'lost-reply', 'invalid-row']) {
    const context = await browser.newContext({ viewport: { width, height: width === 320 ? 740 : 900 }, reducedMotion: 'reduce' }), page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept())
    const batch = responseFor(`/api/households/layout-household/imports/${importId}`)
    batch.drafts = batch.drafts.slice(0, 1).map(row => ({ ...row, duplicateStatus: 'PossibleDuplicate', possibleMatchingTransactionId: 'synthetic-tx' }))
    batch.totalRows = 1; batch.validRows = scenario === 'invalid-row' ? 0 : 1; batch.duplicateRows = 1; batch.invalidRows = scenario === 'invalid-row' ? 1 : 0
    if (scenario === 'invalid-row') Object.assign(batch.drafts[0], { amount: null, validationStatus: 'Invalid', validationMessage: 'Synthetic invalid amount in source row 2.' })
    let uploads = 0, rowSaves = 0, checkpoint = null
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method()
      if (url.origin !== 'http://127.0.0.1:4204') { errors.push('External request blocked'); return route.abort() }
      if (!path.startsWith('/api/')) return route.continue()
      if (method === 'GET' && path === '/api/auth/antiforgery') return route.fulfill({ json: { token: 'synthetic' } })
      if (method === 'PUT' && path === '/api/tutorial-progress/resolve-import-problems') {
        const body = request.postDataJSON(); assert.deepEqual(Object.keys(body).sort(), ['currentStepIndex', 'status', 'tutorialVersion'])
        checkpoint = { ...body, tutorialKey: 'resolve-import-problems', startedAtUtc: '', updatedAtUtc: '', completedAtUtc: null, dismissedAtUtc: null }; return route.fulfill({ json: checkpoint })
      }
      if (method === 'POST' && path.endsWith('/import-profiles/inspect')) return route.fulfill({ json: { headers: ['Date', 'Description', 'Amount'], previewRows: [['2026-10-01', 'Synthetic', '-12.3456']], matchedProfile: null, suggestedProfile: null,
        worksheets: [{ id: 'sheet-a', name: 'Transactions', isHidden: false, transactionRows: 1, problem: null }], selectedWorksheetId: 'sheet-a', selectedWorksheetName: 'Transactions', previewRowNumbers: [2] } })
      if (method === 'POST' && path.endsWith('/imports')) {
        uploads++; assert.ok(['csv', 'xlsx', 'duplicate-file', 'lost-reply'].includes(scenario))
        if (scenario === 'duplicate-file' && uploads === 1) return route.fulfill({ status: 409, json: { detail: 'Synthetic repeated-file warning. Confirm only if intentional.' } })
        if (scenario === 'lost-reply') return route.abort()
        return route.fulfill({ json: { importFileId: importId, ...batch } })
      }
      if (method === 'PUT' && path.endsWith(`/imports/${importId}/drafts`)) {
        assert.equal(scenario, 'invalid-row'); assert.equal(++rowSaves, 1); const { drafts: updates } = request.postDataJSON(); assert.equal(updates[0].amount, -12.3456)
        batch.drafts = batch.drafts.map(row => ({ ...row, ...updates[0], validationStatus: 'Valid', validationMessage: null })); batch.invalidRows = 0; batch.validRows = 1
        return route.fulfill({ json: { summary: draftPageFor(batch).summary, items: batch.drafts, removedDraftIds: [], savedRows: 1 } })
      }
      if (method !== 'GET') { errors.push(`Unexpected create/profile/decision ${method} ${path}`); return route.abort() }
      if (path === '/api/tutorial-progress') return route.fulfill({ json: checkpoint ? [checkpoint] : [] })
      if (path.endsWith('/imports')) return route.fulfill({ json: { items: [batch], page: 1, pageSize: 25, totalCount: 1, totalPages: 1, totalVisibleCount: 1 } })
      if (path.endsWith(`/imports/${importId}/drafts`)) return route.fulfill({ json: draftPageFor(batch, url.searchParams) })
      try { return route.fulfill({ json: responseFor(path, { viewer: scenario === 'viewer' }) }) } catch (error) { errors.push(error.message); return route.abort() }
    })
    const clickPage = async locator => {
      await locator.scrollIntoViewIfNeeded(); await locator.evaluate(element => {
        const header = document.querySelector('.app-context-header')?.getBoundingClientRect().bottom ?? 128, coach = document.querySelector('.tutorial-coach-card')?.getBoundingClientRect().top ?? innerHeight, box = element.getBoundingClientRect()
        if (box.top < header + 8 || box.bottom > coach - 8) window.scrollBy(0, box.top - header - 16)
      }); await locator.click()
    }
    await page.goto('http://127.0.0.1:4204/tutorials')
    await page.locator('.tutorial-card').filter({ has: page.getByRole('heading', { name: 'Resolve import problems', exact: true }) }).getByRole('button', { name: 'Start tutorial', exact: true }).click()
    const guide = page.getByRole('region', { name: 'Resolve import problems tutorial controls' }), next = () => guide.getByRole('button', { name: 'Next', exact: true }).click()
    if (scenario === 'inspect') await guide.getByRole('button', { name: 'No current problem', exact: true }).click()
    else {
      if (['staged', 'viewer', 'invalid-row'].includes(scenario)) await guide.getByRole('button', { name: 'Staged rows or duplicates', exact: true }).click()
      else {
        await guide.getByRole('button', { name: 'Upload or file settings', exact: true }).click()
        await page.locator('input[type="file"]').setInputFiles({ name: scenario === 'xlsx' ? 'synthetic.xlsx' : 'synthetic.csv', mimeType: scenario === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv', buffer: Buffer.from('synthetic intercepted file') })
        await next(); await next(); assert.equal(uploads, 0)
        if (scenario === 'xlsx') { await clickPage(page.getByRole('button', { name: 'Preview workbook', exact: true })); await page.getByText('Selected worksheet:', { exact: false }).waitFor(); assert.equal(uploads, 0) }
        await clickPage(page.getByRole('button', { name: 'Upload for review', exact: true }))
        if (scenario === 'duplicate-file') {
          await guide.getByText('Needs attention').waitFor(); const allow = page.getByRole('checkbox', { name: /Allow this file to be imported again/ }); assert.ok(!await allow.isChecked())
          await clickPage(allow); await clickPage(page.getByRole('button', { name: 'Upload for review', exact: true }))
        }
        if (scenario === 'lost-reply') { await guide.getByRole('button', { name: 'Inspect saved imports', exact: true }).click(); assert.equal(uploads, 1) }
        else await clickPage(page.getByRole('link', { name: 'Review this import', exact: true }))
      }
      await guide.getByRole('button', { name: 'Use this import', exact: true }).click()
      if (scenario === 'invalid-row') {
        assert.ok(await guide.getByRole('button', { name: 'Next', exact: true }).isDisabled())
        const amount = page.getByLabel('Amount', { exact: true }); await clickPage(amount); await amount.fill('-12.3456'); await clickPage(page.getByRole('button', { name: 'Save all corrections (1)', exact: true }))
      }
      await next()
    }
    await page.screenshot({ path: resolve(output, `${width}-${scenario}-complete.png`) }); assert.ok(await guide.evaluate(element => { const box = element.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight && box.right <= innerWidth }))
    const done = page.waitForResponse(response => response.request().method() === 'PUT' && response.request().postDataJSON()?.status === 'Completed')
    await guide.getByRole('button', { name: 'Continue here', exact: true }).click(); await done
    assert.equal(checkpoint.status, 'Completed'); assert.equal(uploads, scenario === 'duplicate-file' ? 2 : ['csv', 'xlsx', 'lost-reply'].includes(scenario) ? 1 : 0); assert.equal(rowSaves, scenario === 'invalid-row' ? 1 : 0)
    assert.equal(batch.drafts[0].isDuplicateAcknowledged, false); assert.equal(batch.drafts[0].reviewDecision, 'Pending')
    assert.equal(await page.locator('[data-tutorial-inert]').count(), 0); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    results.push({ width, scenario }); console.log(`${width}px: ${scenario}`); await context.close()
  }
  assert.deepEqual(errors, []); await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2)); console.log(`${results.length} import-problem cases passed; no live uploads or automatic decisions`)
} finally { await browser?.close(); await server.close() }
