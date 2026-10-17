// Synthetic saved records and intercepted writes only. No database or export.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { responseFor } from './fixtures.mjs'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), client = resolve(root, 'BudgetApp/budgetapp.client')
const require = createRequire(resolve(client, 'package.json'))
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href)
const react = (await import(pathToFileURL(require.resolve('@vitejs/plugin-react')).href)).default
const { chromium } = await import(process.env.BUDGETAPP_QA_PLAYWRIGHT_PATH ? pathToFileURL(process.env.BUDGETAPP_QA_PLAYWRIGHT_PATH).href : 'playwright')
const output = resolve(root, 'artifacts/transaction-tutorial-qa'); await mkdir(output, { recursive: true })
const server = await createServer({ root: client, configFile: false, plugins: [react()], server: { host: '127.0.0.1', port: 4201, strictPort: true } })
const results = [], errors = []; let browser
try {
  await server.listen(); browser = await chromium.launch({ headless: true, ...(process.env.BUDGETAPP_QA_BROWSER_PATH ? { executablePath: process.env.BUDGETAPP_QA_BROWSER_PATH } : {}) })
  for (const width of [1440, 390, 320]) for (const scenario of ['unchanged', 'viewer', 'empty', 'save', 'filtered-out', 'lost-reply', 'failed-read']) {
    const context = await browser.newContext({ viewport: { width, height: width === 320 ? 740 : 900 }, reducedMotion: 'reduce' })
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept())
    let rows = responseFor('/api/households/layout-household/transactions').items.slice(0, 1).map(row => ({ ...row, canEdit: scenario !== 'viewer' }))
    if (scenario === 'empty') rows = []
    const selectedId = rows[0]?.id
    let writes = 0, checkpoint = null, failRead = scenario === 'failed-read'
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method()
      if (url.origin !== 'http://127.0.0.1:4201') { errors.push('External request blocked'); return route.abort() }
      if (!path.startsWith('/api/')) return route.continue()
      if (method === 'GET' && path === '/api/auth/antiforgery') return route.fulfill({ json: { token: 'synthetic' } })
      if (method === 'PUT' && path === '/api/tutorial-progress/search-edit-transactions') {
        const body = request.postDataJSON(); assert.deepEqual(Object.keys(body).sort(), ['currentStepIndex', 'status', 'tutorialVersion'])
        checkpoint = { ...body, tutorialKey: 'search-edit-transactions', startedAtUtc: '', updatedAtUtc: '', completedAtUtc: null, dismissedAtUtc: null }
        assert.ok(!JSON.stringify(checkpoint).includes(selectedId ?? 'never-a-record'))
        return route.fulfill({ json: checkpoint })
      }
      if (method === 'PUT' && path.endsWith(`/transactions/${selectedId}`)) {
        assert.ok(['save', 'filtered-out', 'lost-reply'].includes(scenario)); assert.equal(++writes, 1)
        const input = request.postDataJSON(); assert.equal(input.amount, -12.3456); assert.ok(input.updatedAtUtc)
        rows = scenario === 'filtered-out' ? [] : rows.map(row => ({ ...row, ...input }))
        return scenario === 'lost-reply' ? route.abort() : route.fulfill({ status: 204 })
      }
      if (method !== 'GET') { errors.push(`Unexpected write ${method} ${path}`); return route.abort() }
      if (path === '/api/tutorial-progress') return route.fulfill({ json: checkpoint ? [checkpoint] : [] })
      if (path.endsWith('/transactions')) return failRead ? route.fulfill({ status: 503, json: { detail: 'Synthetic transaction read failure' } })
        : route.fulfill({ json: { items: rows, hasMore: false, page: 1, pageSize: 100, totalCount: rows.length, totalPages: rows.length ? 1 : 0, totalsByCurrency: rows.length ? { CAD: rows.reduce((sum, row) => sum + row.amount, 0) } : {} } })
      try { return route.fulfill({ json: responseFor(path, { viewer: scenario === 'viewer' }) }) }
      catch (error) { errors.push(error.message); return route.abort() }
    })
    const clickPage = async locator => {
      await locator.scrollIntoViewIfNeeded()
      await locator.evaluate(element => {
        const header = document.querySelector('.app-context-header')?.getBoundingClientRect().bottom ?? 128
        const coach = document.querySelector('.tutorial-coach-card')?.getBoundingClientRect().top ?? innerHeight
        const box = element.getBoundingClientRect()
        if (box.top < header + 8 || box.bottom > coach - 8) window.scrollBy(0, box.top - header - 16)
      }); await locator.click()
    }
    await page.goto('http://127.0.0.1:4201/tutorials')
    await page.locator('.tutorial-card').filter({ has: page.getByRole('heading', { name: 'Find and correct a transaction', exact: true }) }).getByRole('button', { name: 'Start tutorial', exact: true }).click()
    const guide = page.getByRole('region', { name: 'Find and correct a transaction tutorial controls' })
    const next = () => guide.getByRole('button', { name: 'Next', exact: true }).click()
    if (failRead) { await guide.getByText('Needs attention').waitFor(); failRead = false; await clickPage(page.getByRole('button', { name: 'Retry search', exact: true })) }
    await next(); await next()
    await page.getByLabel('Transaction to review').selectOption(scenario === 'empty' ? 'review' : selectedId)
    await guide.getByRole('button', { name: 'Use this choice', exact: true }).click()
    assert.equal(writes, 0)
    if (['save', 'filtered-out', 'lost-reply'].includes(scenario)) {
      await clickPage(page.getByRole('button', { name: 'Edit', exact: true })); await next()
      await clickPage(page.getByLabel('Amount', { exact: true })); await page.getByLabel('Amount', { exact: true }).fill('-12.3456'); await next()
      assert.ok(await guide.getByRole('button', { name: 'Next', exact: true }).isDisabled())
      await clickPage(page.getByRole('button', { name: 'Save transaction', exact: true }))
      if (scenario === 'lost-reply') {
        await page.getByRole('button', { name: 'Check saved transaction', exact: true }).waitFor()
        assert.ok(await page.getByRole('button', { name: 'Save transaction', exact: true }).isDisabled())
        await clickPage(page.getByRole('button', { name: 'Check saved transaction', exact: true }))
      }
      await next(); await next()
    } else if (scenario === 'viewer') { assert.equal(await page.getByRole('button', { name: 'Edit', exact: true }).count(), 0); await next(); await next() }
    else if (scenario !== 'empty') { await guide.getByRole('button', { name: 'Keep unchanged', exact: true }).click(); await next() }
    await page.screenshot({ path: resolve(output, `${width}-${scenario}-complete.png`) })
    assert.ok(await guide.evaluate(element => { const box = element.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight && box.right <= innerWidth }))
    const done = page.waitForResponse(response => response.request().method() === 'PUT' && response.request().postDataJSON()?.status === 'Completed')
    await guide.getByRole('button', { name: 'Continue with Transactions', exact: true }).click(); await done
    assert.equal(checkpoint.status, 'Completed'); assert.equal(writes, ['save', 'filtered-out', 'lost-reply'].includes(scenario) ? 1 : 0)
    assert.equal(await page.locator('[data-tutorial-inert]').count(), 0); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    results.push({ width, scenario }); console.log(`${width}px: ${scenario}`); await context.close()
  }
  assert.deepEqual(errors, []); await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2))
  console.log(`${results.length} transaction tutorial cases passed; synthetic intercepted records only`)
} finally { await browser?.close(); await server.close() }
