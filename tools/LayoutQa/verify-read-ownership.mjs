import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { importId, responseFor } from './fixtures.mjs'

// Read-only actual-app QA: fictional GETs only; no database, SMTP, saved browser
// profile or server proxy. A unique port fails safely if already occupied.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const client = resolve(root, 'BudgetApp/budgetapp.client')
const require = createRequire(resolve(client, 'package.json'))
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href)
const react = (await import(pathToFileURL(require.resolve('@vitejs/plugin-react')).href)).default
const { chromium } = await import(process.env.BUDGETAPP_QA_PLAYWRIGHT_PATH
  ? pathToFileURL(process.env.BUDGETAPP_QA_PLAYWRIGHT_PATH).href : 'playwright')
const server = await createServer({ root: client, configFile: false, plugins: [react()], server: { host: '127.0.0.1', port: 4179, strictPort: true } })
const output = resolve(root, 'artifacts/read-ownership-qa')
const otherId = '22222222-2222-2222-2222-222222222222'
const firstDetail = responseFor(`/api/households/test/imports/${importId}`)
const otherDetail = { ...firstDetail, id: otherId, originalFileName: 'second.xlsx', totalRows: 2, validRows: 2, drafts: firstDetail.drafts.slice(0, 2).map(row => ({ ...row, id: `second-${row.id}`, description: 'Second import description' })) }
const firstList = responseFor('/api/households/test/imports')
const both = { ...firstList, items: [firstList.items[0], { ...firstList.items[0], id: otherId, originalFileName: 'second.xlsx' }], totalCount: 2, totalVisibleCount: 2 }
const empty = { ...firstList, items: [], totalCount: 0, totalPages: 0, totalVisibleCount: 0 }
const results = [], errors = [], mutations = []
let browser, lastPage, lastCase
function deferred() {
  let resolve
  const promise = new Promise(yes => { resolve = yes })
  return { promise, resolve }
}
try {
  await mkdir(output, { recursive: true })
  await server.listen()
  browser = await chromium.launch({ headless: true, ...(process.env.BUDGETAPP_QA_BROWSER_PATH ? { executablePath: process.env.BUDGETAPP_QA_BROWSER_PATH } : {}) })
  for (const width of [1440, 390]) {
    for (const scenario of ['initial-list-failure', 'empty-refresh-failure', 'preview-failure', 'late-detail', 'late-list']) {
      const context = await browser.newContext({ viewport: { width, height: 900 } })
      const page = await context.newPage()
      lastPage = page
      lastCase = { width, scenario }
      const release = deferred()
      let listReads = 0, detailReads = 0, previewReads = 0
      // The app runs under StrictMode: fail until an explicit retry, and arm
      // delayed reads after readiness rather than assuming an initial call count.
      let failList = scenario === 'initial-list-failure', failPreview = scenario === 'preview-failure'
      let holdList = false, holdDetail = false, waitingList = false
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url())
        if (url.origin !== 'http://127.0.0.1:4179') { errors.push(`External request blocked: ${url.origin}`); return route.abort() }
        if (!url.pathname.startsWith('/api/')) return route.continue()
        if (request.method() !== 'GET') { mutations.push(`${request.method()} ${url.pathname}`); return route.abort() }
        let body, failed = false
        if (url.pathname.endsWith('/imports')) {
          listReads++
          failed = failList
          if (scenario === 'empty-refresh-failure') body = empty
          else if (holdList) { holdList = false; waitingList = true; await release.promise; body = both }
          else if (scenario === 'late-list' && waitingList) body = { ...both, items: [both.items[1]], totalCount: 1 }
          else body = both
        } else if (url.pathname.endsWith(`/imports/${importId}`)) {
          detailReads++
          if (holdDetail) { holdDetail = false; await release.promise }
          body = firstDetail
        } else if (url.pathname.endsWith(`/imports/${otherId}`)) body = otherDetail
        else if (url.pathname.endsWith('/categorization-rule-application-preview')) {
          previewReads++
          failed = failPreview
          body = { fillChangedRows: 0, reapplyChangedRows: 0, reapplyUnchangedRows: 0 }
        } else {
          try { body = responseFor(url.pathname) }
          catch (error) { errors.push(error.message); return route.abort() }
        }
        try { await route.fulfill({ status: failed ? 503 : 200, contentType: 'application/json', body: JSON.stringify(failed ? { detail: 'Synthetic read unavailable' } : body) }) }
        catch (error) {
          // An aborted obsolete GET can close its interception before fulfillment.
          if (!request.failure() && !page.isClosed()) errors.push(error.message)
        }
      })
      await page.goto(`http://127.0.0.1:4179/imports/review${scenario === 'empty-refresh-failure' ? '' : `?importId=${importId}`}`)
      const description = page.getByLabel('Description', { exact: true }).first()
      if (scenario === 'initial-list-failure') {
        const feedback = page.getByRole('alert', { name: 'import list load status' })
        await feedback.waitFor()
        assert.equal(await page.getByRole('heading', { name: 'No imports yet' }).count(), 0)
        failList = false
        await feedback.getByRole('button', { name: 'Retry loading' }).click()
        await page.getByRole('button', { name: 'Refresh import list' }).waitFor()
        assert.ok(await description.isEnabled())
      } else if (scenario === 'empty-refresh-failure') {
        await page.getByRole('heading', { name: 'No imports yet' }).waitFor()
        failList = true
        await page.getByRole('button', { name: 'Refresh import list' }).click()
        const feedback = page.getByRole('alert', { name: 'import list load status' })
        await feedback.waitFor()
        assert.equal(await page.getByRole('heading', { name: 'No imports yet' }).count(), 0)
        failList = false
        await feedback.getByRole('button', { name: 'Retry loading' }).click()
        await page.getByRole('heading', { name: 'No imports yet' }).waitFor()
      } else if (scenario === 'preview-failure') {
        const feedback = page.getByRole('alert', { name: 'categorization rule matches load status' })
        await feedback.waitFor()
        assert.ok(await page.getByRole('button', { name: 'Fill uncategorized (unavailable)' }).isDisabled())
        const previousReads = previewReads
        failPreview = false
        await feedback.getByRole('button', { name: 'Retry loading' }).click()
        await feedback.waitFor({ state: 'detached' })
        assert.equal(previewReads, previousReads + 1)
      } else {
        await description.waitFor()
        holdList = scenario === 'late-list'
        holdDetail = scenario === 'late-detail'
        await page.getByRole('button', { name: 'Refresh selected import' }).click()
        // Wait for the relevant request, not a guessed network delay.
        await page.waitForFunction(({ scenario }) => {
          const statuses = [...document.querySelectorAll('[role="status"]')].map(node => node.textContent)
          return statuses.some(text => text.includes(scenario === 'late-list' ? 'Refreshing import list' : 'Refreshing selected import'))
        }, { scenario })
        if (scenario === 'late-list') await page.getByLabel('File status').selectOption('all')
        else await page.locator('.import-file-picker select').nth(1).selectOption(otherId)
        await page.getByRole('heading', { name: 'Review transactions in second.xlsx' }).waitFor()
        await description.fill('Keep the second import correction')
        await page.getByRole('button', { name: 'Save all corrections (1)' }).waitFor()
        release.resolve()
        // The expected late result is ignored even after the request settles.
        await page.waitForLoadState('networkidle')
        assert.equal(await description.inputValue(), 'Keep the second import correction')
        assert.equal(await page.locator('.import-file-picker select').nth(1).inputValue(), otherId)
        assert.equal(await page.getByRole('alert').count(), 0)
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      await page.screenshot({ path: resolve(output, `${width}-${scenario}.png`), fullPage: true })
      results.push({ width, scenario, listReads, detailReads, previewReads })
      release.resolve()
      await context.close()
    }
  }
  assert.deepEqual(mutations, [], 'QA never issues writes')
  assert.deepEqual(errors, [], 'No page errors, external requests or unmapped reads')
  await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2))
  console.log(`${results.length} actual-app read/failure/race cases passed; no writes, database or email. Evidence: ${output}`)
} catch (error) {
  if (lastPage && !lastPage.isClosed()) {
    await lastPage.screenshot({ path: resolve(output, 'failure.png'), fullPage: true })
    console.error(JSON.stringify({ ...lastCase, url: lastPage.url(), errors, mutations,
      text: (await lastPage.locator('body').innerText()).slice(0, 5000) }, null, 2))
  }
  throw error
} finally {
  await browser?.close()
  await server.close()
}
