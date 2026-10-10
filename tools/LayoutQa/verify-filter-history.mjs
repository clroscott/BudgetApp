import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { household, importId, responseFor } from './fixtures.mjs'

// Actual React app with disposable browser profiles and intercepted fictional
// GETs. No application server, database, real email, or mutation is permitted.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const client = resolve(root, 'BudgetApp/budgetapp.client')
const require = createRequire(resolve(client, 'package.json'))
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href)
const react = (await import(pathToFileURL(require.resolve('@vitejs/plugin-react')).href)).default
const { chromium } = await import(process.env.BUDGETAPP_QA_PLAYWRIGHT_PATH
  ? pathToFileURL(process.env.BUDGETAPP_QA_PLAYWRIGHT_PATH).href : 'playwright')
const server = await createServer({ root: client, configFile: false, plugins: [react()],
  server: { host: '127.0.0.1', port: 4180, strictPort: true } })
const output = resolve(root, 'artifacts/filter-history-qa')
const otherId = '22222222-2222-2222-2222-222222222222'
const firstDetail = responseFor(`/api/households/test/imports/${importId}`)
const otherDetail = { ...firstDetail, id: otherId, originalFileName: 'completed.xlsx', status: 'Completed' }
const firstList = responseFor('/api/households/test/imports')
const results = [], errors = [], mutations = []
let browser, lastPage, lastCase
function deferred() {
  let resolve
  const promise = new Promise(yes => { resolve = yes })
  return { promise, resolve }
}
async function traverse(page, direction, accept) {
  const dialog = new Promise(resolve => page.once('dialog', async dialog => {
    if (accept) await dialog.accept(); else await dialog.dismiss()
    resolve()
  }))
  await page.evaluate(direction => window.history[direction](), direction)
  await dialog
}
try {
  await mkdir(output, { recursive: true })
  await server.listen()
  browser = await chromium.launch({ headless: true, ...(process.env.BUDGETAPP_QA_BROWSER_PATH ? { executablePath: process.env.BUDGETAPP_QA_BROWSER_PATH } : {}) })
  for (const width of [1440, 390]) {
    for (const scenario of ['transactions', 'annual-report', 'imports']) {
      const context = await browser.newContext({ viewport: { width, height: 900 } })
      const page = await context.newPage()
      lastPage = page; lastCase = { width, scenario }
      const late = deferred()
      let held = false, transactionReads = 0
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url())
        if (url.origin !== 'http://127.0.0.1:4180') { errors.push(`External request: ${url.origin}`); return route.abort() }
        if (!url.pathname.startsWith('/api/')) return route.continue()
        if (request.method() !== 'GET') { mutations.push(`${request.method()} ${url.pathname}`); return route.abort() }
        let body
        if (url.pathname.endsWith('/imports')) body = { ...firstList,
          items: url.searchParams.get('filter') === 'Completed' ? [otherDetail] : [firstList.items[0]], totalCount: 1 }
        else if (url.pathname.endsWith(`/imports/${otherId}`)) body = otherDetail
        else {
          try { body = responseFor(url.pathname) }
          catch (error) { errors.push(error.message); return route.abort() }
        }
        if (url.pathname.endsWith('/transactions')) {
          transactionReads++
          const description = url.searchParams.get('description')
          if (description === 'Delayed obsolete result') { held = true; await late.promise; body = { ...body, items: [], totalCount: 0, totalsByCurrency: { CAD: 99999 } } }
        }
        if (/\/annual-budget-overview\/\d+$/.test(url.pathname)) body = { ...body,
          year: Number(url.pathname.split('/').at(-1)), scope: url.searchParams.get('scope') ?? 'Household' }
        try { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }) }
        catch (error) { if (!request.failure() && !page.isClosed()) errors.push(error.message) }
      })
      if (scenario === 'transactions') {
        const original = `/transactions?budgetInclusion=Personal&currency=CAD&spendingOnly=true&fromDate=2026-01-01&toDate=2026-12-31&report=annual-overview&reportYear=2026&reportHouseholdId=${household.id}`
        await page.goto(`http://127.0.0.1:4180${original}`)
        const totals = page.getByRole('region', { name: 'Matching totals across all pages' })
        await totals.waitFor()
        const filter = page.getByLabel('Description contains', { exact: true })
        await filter.fill('Refund')
        assert.equal(new URL(page.url()).searchParams.has('description'), false)
        await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
        await totals.waitFor()
        await page.getByText(/View changed — no longer matches/).waitFor()
        await filter.focus()
        await page.goBack()
        await page.waitForFunction(() => document.querySelector('input[placeholder="Merchant or description"]')?.value === '')
        assert.equal(await filter.inputValue(), '')
        assert.equal(await filter.evaluate(node => document.activeElement === node), true)
        await page.getByText('Annual overview drill-down', { exact: true }).waitFor()
        await page.goForward()
        await page.waitForFunction(() => new URLSearchParams(location.search).get('description') === 'Refund')
        assert.equal(await filter.inputValue(), 'Refund')
        await totals.waitFor()
        await page.getByRole('button', { name: 'Edit', exact: true }).first().click()
        const edit = page.getByLabel('Description', { exact: true })
        await edit.fill('Keep unsaved correction')
        const length = await page.evaluate(() => history.length)
        const reads = transactionReads
        await traverse(page, 'back', false)
        await page.waitForFunction(() => new URLSearchParams(location.search).get('description') === 'Refund')
        assert.equal(await edit.inputValue(), 'Keep unsaved correction')
        assert.equal(await edit.evaluate(node => document.activeElement === node), true)
        assert.equal(transactionReads, reads)
        assert.equal(await page.evaluate(() => history.length), length)
        await traverse(page, 'back', true)
        await totals.waitFor()
        await filter.fill('Delayed obsolete result')
        await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
        await page.waitForFunction(() => document.body.textContent.includes('Loading transactions'))
        assert.equal(held, true)
        await page.locator('.section-navigation a[href="/transactions"]').click()
        await totals.waitFor()
        late.resolve()
        await page.waitForLoadState('networkidle')
        assert.equal(await page.getByText('No matching transactions', { exact: true }).count(), 0)
        assert.equal((await totals.innerText()).includes('99,999'), false)
      } else if (scenario === 'annual-report') {
        await page.goto('http://127.0.0.1:4180/budgeting/annual-overview?year=2026&scope=Household')
        await page.getByRole('region', { name: 'Annual summary' }).waitFor()
        const scope = page.locator('.annual-overview-controls select')
        await scope.selectOption('Personal')
        await scope.focus()
        await page.getByRole('region', { name: 'Annual summary' }).waitFor()
        await page.goBack()
        await page.waitForFunction(() => new URLSearchParams(location.search).get('scope') === 'Household')
        assert.equal(await scope.inputValue(), 'Household')
        assert.equal(await scope.evaluate(node => document.activeElement === node), true)
        await page.goForward()
        await page.waitForFunction(() => new URLSearchParams(location.search).get('scope') === 'Personal')
        const link = page.getByRole('region', { name: 'Annual summary' }).getByRole('link')
        await link.click()
        await page.getByText('Annual overview drill-down', { exact: true }).waitFor()
        assert.equal(new URL(page.url()).searchParams.get('budgetInclusion'), 'Personal')
        await page.getByRole('link', { name: 'Return to Annual overview', exact: true }).click()
        await page.getByRole('region', { name: 'Annual summary' }).waitFor()
        assert.equal(await scope.inputValue(), 'Personal')
      } else {
        await page.goto(`http://127.0.0.1:4180/imports/review?importId=${importId}`)
        await page.getByRole('heading', { name: 'Review transactions in sample-layout.xlsx' }).waitFor()
        const status = page.locator('.import-file-picker select').first()
        await status.selectOption('completed')
        await page.getByRole('heading', { name: 'Review transactions in completed.xlsx' }).waitFor()
        await status.focus()
        await page.goBack()
        await page.getByRole('heading', { name: 'Review transactions in sample-layout.xlsx' }).waitFor()
        assert.equal(await status.inputValue(), 'inProgress')
        assert.equal(await status.evaluate(node => document.activeElement === node), true)
        await page.goForward()
        await page.getByRole('heading', { name: 'Review transactions in completed.xlsx' }).waitFor()
        await page.goBack()
        const edit = page.getByLabel('Description', { exact: true }).first()
        await edit.fill('Keep import correction')
        const length = await page.evaluate(() => history.length)
        await traverse(page, 'forward', false)
        await page.waitForFunction(id => new URLSearchParams(location.search).get('importId') === id, importId)
        assert.equal(await edit.inputValue(), 'Keep import correction')
        assert.equal(await page.evaluate(() => history.length), length)
      }
      assert.equal(await page.locator('.page-announcement').innerText(), scenario === 'annual-report' ? 'Annual overview page loaded.' : '')
      await page.screenshot({ path: resolve(output, `${width}-${scenario}.png`), fullPage: true })
      results.push({ width, scenario, transactionReads })
      late.resolve()
      await context.close()
    }
  }
  assert.deepEqual(errors, [])
  assert.deepEqual(mutations, [])
  await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2))
  console.log(`${results.length} actual-app filter/history cases passed; no writes, database or email. Evidence: ${output}`)
} catch (error) {
  if (lastPage && !lastPage.isClosed()) {
    await lastPage.screenshot({ path: resolve(output, 'failure.png'), fullPage: true })
    console.error(JSON.stringify({ ...lastCase, url: lastPage.url(), errors, mutations,
      text: (await lastPage.locator('body').innerText()).slice(0, 3500) }, null, 2))
  }
  throw error
} finally {
  await browser?.close()
  await server.close()
}
