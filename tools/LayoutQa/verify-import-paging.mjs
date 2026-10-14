import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { importId, responseFor, draftPageFor } from './fixtures.mjs'

// Actual React app, entirely intercepted synthetic reads/writes. No application
// server, database, email or saved browser profile is used. Unknown API calls and
// every external request fail closed rather than reaching a real service.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const client = resolve(root, 'BudgetApp/budgetapp.client')
const require = createRequire(resolve(client, 'package.json'))
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href)
const react = (await import(pathToFileURL(require.resolve('@vitejs/plugin-react')).href)).default
const { chromium } = await import(process.env.BUDGETAPP_QA_PLAYWRIGHT_PATH
  ? pathToFileURL(process.env.BUDGETAPP_QA_PLAYWRIGHT_PATH).href : 'playwright')
const server = await createServer({ root: client, configFile: false, plugins: [react()],
  server: { host: '127.0.0.1', port: 4181, strictPort: true } })
const output = resolve(root, 'artifacts/import-paging-ui-qa')
const base = responseFor(`/api/households/test/imports/${importId}`)
const results = [], errors = []
let browser, lastPage, lastCase

try {
  await mkdir(output, { recursive: true })
  await server.listen()
  browser = await chromium.launch({ headless: true, ...(process.env.BUDGETAPP_QA_BROWSER_PATH ? { executablePath: process.env.BUDGETAPP_QA_BROWSER_PATH } : {}) })
  for (const width of [1440, 390]) {
    for (const rowCount of [100, 1000, 10000]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } })
      const page = await context.newPage()
      lastPage = page; lastCase = { width, rowCount }
      let version = 0, pageReads = 0, listReads = 0, previewReads = 0, saves = 0, decisions = 0, completions = 0, dialogCount = 0
      const pageBytes = [], requests = []
      let batch = { ...base, totalRows: rowCount, validRows: rowCount,
        drafts: Array.from({ length: rowCount }, (_, index) => ({ ...base.drafts[0], id: `synthetic-${index}`,
          sourceRowNumber: index + 2, description: `Synthetic purchase ${String(index).padStart(5, '0')}` })) }
      function summary() {
        return draftPageFor({ ...batch, updatedAtUtc: `2026-10-14T12:00:00.${String(version).padStart(7, '0')}+00:00` }).summary
      }
      page.on('pageerror', error => errors.push(error.message))
      page.on('dialog', dialog => { dialogCount++; return dialog.accept() })
      await page.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url())
        if (url.origin !== 'http://127.0.0.1:4181') { errors.push(`External request blocked: ${url.origin}`); return route.abort() }
        if (!url.pathname.startsWith('/api/')) return route.continue()
        requests.push(`${request.method()} ${url.pathname}${url.search}`)
        const suffix = url.pathname.split(`/imports/${importId}`)[1]
        let body
        try {
          if (request.method() === 'GET' && suffix === '') throw new Error('Legacy full-import request is forbidden')
          if (url.pathname === '/api/auth/antiforgery') body = { token: 'synthetic-only' }
          else if (request.method() === 'GET' && url.pathname.endsWith('/imports')) {
            listReads++
            const current = summary()
            body = { items: [{ ...current, ...current.counts, uploadedAtUtc: '2026-10-14T12:00:00Z' }],
              page: 1, pageSize: 50, totalCount: 1, totalPages: 1, totalVisibleCount: 1 }
          } else if (request.method() === 'GET' && suffix === '/drafts') {
            pageReads++
            body = { ...draftPageFor(batch, url.searchParams), summary: summary() }
            assert.ok(body.items.length <= 100)
            pageBytes.push(Buffer.byteLength(JSON.stringify(body)))
          } else if (request.method() === 'POST' && suffix === '/budget-choice-preview') {
            previewReads++
            const input = request.postDataJSON()
            assert.equal(input.expectedImportUpdatedAtUtc, summary().updatedAtUtc)
            const matching = draftPageFor(batch, new URLSearchParams({ filter: input.filter })).totalCount
            assert.equal(matching, rowCount)
            const edited = new Set(input.editedDraftIds)
            const items = batch.drafts.filter(row => edited.has(row.id) || row.includeInPersonalBudget !== input.personal ||
              row.includeInHouseholdBudget !== input.household).map(row => ({ id: row.id, transactionDate: row.transactionDate,
                amount: row.amount, description: row.description, selectedCategoryId: row.selectedCategoryId,
                includeInPersonalBudget: row.includeInPersonalBudget, includeInHouseholdBudget: row.includeInHouseholdBudget }))
            body = { items, skipped: 0, unchanged: rowCount - items.length, updatedAtUtc: summary().updatedAtUtc }
          } else if (request.method() === 'PUT' && (suffix === '/drafts' || suffix?.startsWith('/drafts/'))) {
            assert.equal(url.searchParams.get('expectedImportUpdatedAtUtc'), summary().updatedAtUtc)
            assert.equal(url.searchParams.get('returnChanges'), 'true')
            saves++
            const input = request.postDataJSON()
            const updates = suffix === '/drafts' ? input.drafts : [{ ...input, draftId: suffix.split('/').at(-1) }]
            const byId = new Map(updates.map(row => [row.draftId, row]))
            assert.equal(byId.size, updates.length)
            batch = { ...batch, drafts: batch.drafts.map(row => byId.has(row.id)
              ? { ...row, ...byId.get(row.id), reviewDecision: 'Pending' } : row) }
            version++
            body = { summary: summary(), items: batch.drafts.filter(row => byId.has(row.id)), removedDraftIds: [], savedRows: updates.length }
          } else if (request.method() === 'POST' && suffix === '/decisions') {
            decisions++
            assert.equal(request.postDataJSON().decision, 'Approved')
            batch = { ...batch, drafts: batch.drafts.map(row => ({ ...row, reviewDecision: 'Approved' })) }
            version++
            body = null
          } else if (request.method() === 'POST' && suffix === '/complete') {
            completions++
            assert.ok(batch.drafts.every(row => row.reviewDecision === 'Approved'))
            batch = { ...batch, status: 'Completed' }; version++
            body = { importFileId: importId, createdTransactionCount: rowCount, approvedRows: rowCount, excludedRows: 0, status: 'Completed' }
          } else if (request.method() === 'GET') body = responseFor(url.pathname)
          else throw new Error(`Unmapped simulated API operation: ${request.method()} ${url.pathname}`)
          await route.fulfill({ status: body === null ? 204 : 200, contentType: 'application/json',
            ...(body === null ? {} : { body: JSON.stringify(body) }) })
        } catch (error) { errors.push(error.message); await route.abort() }
      })
      await page.goto(`http://127.0.0.1:4181/imports/review?importId=${importId}`)
      const firstDescription = page.getByLabel('Description', { exact: true }).first()
      await firstDescription.waitFor()
      await page.waitForFunction(() => !document.querySelector('.import-description-field input')?.disabled)
      assert.equal(await page.getByRole('article').count(), 100)
      await firstDescription.fill('Keep this correction across pages')
      await page.getByRole('button', { name: 'Save all corrections (1)', exact: true }).waitFor()
      if (rowCount > 100) {
        const dialogsBeforePaging = dialogCount
        await page.getByRole('button', { name: 'Next rows', exact: true }).click()
        await page.getByRole('article', { name: 'Excel row 102', exact: true }).waitFor()
        assert.equal(await page.getByRole('article').count(), 100)
        await page.getByRole('button', { name: 'Previous rows', exact: true }).click()
        await page.waitForFunction(() => !document.querySelector('.import-description-field input')?.disabled)
        assert.equal(await firstDescription.inputValue(), 'Keep this correction across pages')
        assert.equal(dialogCount, dialogsBeforePaging, 'Safe row paging preserves corrections without prompting')
      }
      const dialogsBeforeFilters = dialogCount
      const rowFilter = page.locator('.import-row-toolbar select')
      await rowFilter.selectOption('categorized')
      await page.getByText('No rows match this filter.', { exact: true }).waitFor()
      await rowFilter.selectOption('all')
      await firstDescription.waitFor()
      assert.equal(await firstDescription.inputValue(), 'Keep this correction across pages')
      assert.equal(dialogCount, dialogsBeforeFilters, 'Safe row filtering does not prompt or lose corrections')
      await page.locator('.import-bulk-budget-controls select').first().selectOption('PersonalAndHousehold')
      const apply = page.getByRole('button', { name: `Apply budget choices (${rowCount})`, exact: true })
      await apply.waitFor(); await apply.click()
      await page.getByRole('button', { name: `Save all corrections (${rowCount})`, exact: true }).waitFor()
      assert.equal(saves, 0, 'Applying choices is local staging, not a write')
      assert.equal(await firstDescription.inputValue(), 'Keep this correction across pages')
      await page.getByRole('button', { name: `Save all corrections (${rowCount})`, exact: true }).click()
      await page.getByText(`${rowCount} corrections were saved.`, { exact: true }).waitFor()
      await page.getByRole('button', { name: 'Save all corrections (0)', exact: true }).waitFor()
      assert.equal(saves, 1)
      assert.ok(batch.drafts.every(row => row.includeInHouseholdBudget && row.includeInPersonalBudget))
      const baselineReads = pageReads, baselineLists = listReads
      await firstDescription.fill('One targeted correction')
      const firstRow = page.getByRole('article', { name: 'Excel row 2', exact: true })
      await firstRow.getByRole('button', { name: 'Details', exact: true }).click()
      await firstRow.getByRole('button', { name: 'Save corrections', exact: true }).click()
      await page.getByRole('button', { name: 'Save all corrections (0)', exact: true }).waitFor()
      await page.waitForLoadState('networkidle')
      assert.equal(pageReads, baselineReads, 'Single correction uses its response, not a page reload')
      assert.equal(listReads, baselineLists, 'Single correction does not reload the file list')
      assert.equal(saves, 2)
      assert.equal(await firstDescription.inputValue(), 'One targeted correction')
      await page.getByRole('button', { name: 'Approve all valid', exact: true }).click()
      await page.getByRole('button', { name: 'Create approved transactions', exact: true }).waitFor()
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some(node => node.textContent === 'Create approved transactions' && !node.disabled))
      assert.equal(decisions, 1)
      assert.equal(summary().counts.approvedRows, rowCount)
      await page.getByRole('button', { name: 'Create approved transactions', exact: true }).click()
      await page.getByText('Completed imports are retained to preserve the history of official transactions.', { exact: true }).waitFor()
      assert.equal(completions, 1)
      assert.equal(await firstDescription.isDisabled(), true)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      assert.ok(pageBytes.every(bytes => bytes < 100_000))
      await page.screenshot({ path: resolve(output, `${width}-${rowCount}.png`), fullPage: true })
      results.push({ width, rowCount, pageReads, listReads, previewReads, saves, decisions, completions,
        maximumPageBytes: Math.max(...pageBytes), requests })
      await context.close()
    }
  }
  assert.deepEqual(errors, [])
  await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2))
  console.log(`${results.length} actual-app import paging/bulk/targeted-save/completion cases passed with entirely simulated data. Evidence: ${output}`)
} catch (error) {
  if (lastPage && !lastPage.isClosed()) {
    await lastPage.screenshot({ path: resolve(output, 'failure.png'), fullPage: true })
    console.error(JSON.stringify({ ...lastCase, errors, text: (await lastPage.locator('body').innerText()).slice(0, 3500) }, null, 2))
  }
  throw error
} finally {
  await browser?.close()
  await server.close()
}
