// Synthetic browser QA: all APIs are intercepted; no application DB or email.
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
const output = resolve(root, 'artifacts/read-tutorial-qa')
await mkdir(output, { recursive: true })
const server = await createServer({ root: client, configFile: false, plugins: [react()], server: { host: '127.0.0.1', port: 4196, strictPort: true } })
const results = [], errors = []
const tours = process.argv.slice(2).length ? process.argv.slice(2) : ['annual', 'activity', 'export', 'dashboard', 'totals']
assert.ok(tours.every(tour => ['annual', 'activity', 'export', 'dashboard', 'totals'].includes(tour)))
let browser
try {
  await server.listen()
  browser = await chromium.launch({ headless: true, ...(process.env.BUDGETAPP_QA_BROWSER_PATH ? { executablePath: process.env.BUDGETAPP_QA_BROWSER_PATH } : {}) })
  for (const tour of tours) for (const width of [1440, 390, 320]) for (const scenario of ['normal', 'empty-viewer', 'failed-read']) {
    const key = tour === 'totals' ? 'check-spending-totals' : tour === 'annual' ? 'annual-overview' : tour === 'activity' ? 'review-activity' : tour === 'export' ? 'export-transactions' : 'customize-dashboard'
    const title = tour === 'totals' ? 'Why don’t these totals match?' : tour === 'annual' ? 'Read the Annual Overview' : tour === 'activity' ? 'Review household activity' : tour === 'export' ? 'Export transaction data' : 'Customize your Dashboard'
    const context = await browser.newContext({ viewport: { width, height: width === 320 ? 740 : 900 }, reducedMotion: 'reduce' })
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    page.on('dialog', dialog => dialog.accept())
    let checkpoint = null, failNext = scenario === 'failed-read', failImports = false, exports = 0, downloads = 0, layoutSaves = 0
    let savedLayout = responseFor('/api/households/layout-household/dashboard-layout')
    if (scenario === 'empty-viewer') savedLayout = { ...savedLayout, visiblePanelKeys: [], isDefault: false }
    page.on('download', () => { downloads++ })
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname
      if (url.origin !== 'http://127.0.0.1:4196') { errors.push('External request blocked'); return route.abort() }
      if (!path.startsWith('/api/')) return route.continue()
      if (request.method() === 'GET' && path === '/api/auth/antiforgery') return route.fulfill({ json: { token: 'synthetic' } })
      if (request.method() === 'PUT' && path === `/api/tutorial-progress/${key}`) {
        const body = request.postDataJSON()
        assert.deepEqual(Object.keys(body).sort(), ['currentStepIndex', 'status', 'tutorialVersion'])
        checkpoint = { ...body, tutorialKey: key, startedAtUtc: '', updatedAtUtc: '', completedAtUtc: null, dismissedAtUtc: null }
        return route.fulfill({ json: checkpoint })
      }
      if (tour === 'dashboard' && request.method() === 'PUT' && path.endsWith('/dashboard-layout')) {
        layoutSaves++; assert.equal(layoutSaves, 1)
        savedLayout = { ...request.postDataJSON(), isDefault: false }
        if (scenario === 'failed-read') return route.abort()
        return route.fulfill({ json: savedLayout })
      }
      if (request.method() !== 'GET') { errors.push(`Unexpected write ${path}`); return route.abort() }
      if (path === '/api/tutorial-progress') return route.fulfill({ json: checkpoint ? [checkpoint] : [] })
      if (path.endsWith('/transactions/export.csv')) {
        exports++
        assert.equal(tour, 'export'); assert.equal(url.searchParams.get('description'), 'QA ONLY')
        if (scenario === 'failed-read') return route.fulfill({ status: 503, json: { detail: 'Synthetic export failure' } })
        return route.fulfill({ contentType: 'text/csv', headers: { 'Content-Disposition': 'attachment; filename="qa-only.csv"' }, body: 'Date,Amount,Description\r\n2026-01-01,1.00,QA ONLY\r\n' })
      }
      if ((tour === 'annual' || tour === 'totals' ? path.includes('/annual-budget-overview/') : path.endsWith(tour === 'activity' ? '/audit-events' : tour === 'export' ? '/transactions' : '/dashboard-layout')) && failNext || tour === 'totals' && path.endsWith('/imports') && failImports) {
        return route.fulfill({ status: 503, json: { detail: 'Synthetic report failure' } })
      }
      try {
        let data = responseFor(path, { viewer: scenario === 'empty-viewer' })
        if (path.endsWith('/dashboard-layout')) data = savedLayout
        if (tour === 'totals' && scenario === 'empty-viewer' && path.endsWith('/imports')) data = { items: [], page: 1, pageSize: 25, totalCount: 0, totalPages: 0, totalVisibleCount: 0 }
        if (path.includes('/annual-budget-overview/')) {
          data = { ...data, year: Number(path.split('/').at(-1)), scope: url.searchParams.get('scope') ?? 'Household' }
          if (scenario === 'empty-viewer') data = { ...data, categories: [], budgetedMonthCount: 0, annualBudgetedAmount: 0, remainingAmount: null }
        }
        if (path.endsWith('/audit-events')) data = scenario === 'empty-viewer'
          ? { ...data, items: [], totalCount: 0, totalPages: 0 }
          : { ...data, page: Number(url.searchParams.get('page') ?? 1), totalCount: 51, totalPages: 2 }
        return route.fulfill({ json: data })
      } catch (error) { errors.push(error.message); return route.abort() }
    })
    await page.goto('http://127.0.0.1:4196/tutorials')
    const card = page.locator('.tutorial-card').filter({ has: page.getByRole('heading', { name: title, exact: true }) })
    await card.getByRole('button', { name: 'Start tutorial', exact: true }).click()
    const guide = page.getByRole('region', { name: `${title} tutorial controls` })
    const next = () => guide.getByRole('button', { name: 'Next', exact: true }).click()
    if (scenario === 'failed-read') {
      await guide.getByText('Needs attention').waitFor()
      assert.ok(await guide.getByRole('button', { name: 'Next', exact: true }).isDisabled())
      failNext = false
      await page.locator('[data-tutorial-id="read-tour-reload"]').click()
    }
    if (tour === 'totals') {
      await page.locator('[data-tutorial-id="annual-tour-year"]').fill('2024')
      await page.locator('[data-tutorial-id="annual-tour-scope"]').selectOption('Personal')
      await next(); await next(); await page.locator('[data-tutorial-id="annual-tour-transactions"]').click()
      await guide.getByRole('heading', { name: 'Check the active comparison', exact: true }).waitFor()
      assert.equal(new URL(page.url()).searchParams.get('fromDate'), '2024-01-01')
      await next(); await page.locator('[data-tutorial-id="transaction-tour-description"]').fill('QA ONLY')
      assert.ok(await guide.getByRole('button', { name: 'Next', exact: true }).isDisabled())
      await page.getByRole('button', { name: 'Apply filters', exact: true }).click(); await next()
      failImports = scenario === 'failed-read'; await next()
      if (failImports) {
        await guide.getByText('Needs attention').waitFor(); assert.ok(await guide.getByRole('button', { name: 'Next', exact: true }).isDisabled())
        failImports = false; await page.locator('[data-tutorial-id="read-tour-reload"]').click()
      }
      await page.locator('[data-tutorial-id="import-tour-status"]').selectOption('completed')
      await next(); await page.getByRole('button', { name: 'Apply filters', exact: true }).click(); await next()
      if (scenario !== 'empty-viewer') await page.getByText('View details', { exact: true }).first().click()
      await next(); await guide.getByRole('heading', { name: 'A check—not a guessed diagnosis', exact: true }).waitFor()
      assert.equal(new URL(page.url()).searchParams.get('year'), '2024'); assert.equal(new URL(page.url()).searchParams.get('scope'), 'Personal')
    } else if (tour === 'annual') {
    await page.locator('[data-tutorial-id="annual-tour-year"]').fill('2024')
    await page.locator('[data-tutorial-id="annual-tour-scope"]').selectOption('Personal')
    await next(); await next(); await next(); await next()
    await page.locator('[data-tutorial-id="annual-tour-transactions"].tutorial-task-target').waitFor()
    await page.screenshot({ path: resolve(output, `${width}-${scenario}-drilldown.png`) })
    await page.locator('[data-tutorial-id="annual-tour-transactions"]').click()
    await guide.getByRole('heading', { name: 'Check the matching filters', exact: true }).waitFor()
    const params = new URL(page.url()).searchParams
    assert.equal(params.get('fromDate'), '2024-01-01'); assert.equal(params.get('budgetInclusion'), 'Personal')
    assert.equal(params.get('currency'), 'CAD')
    const edit = page.getByRole('button', { name: 'Edit', exact: true }).first()
    if (await edit.count()) assert.ok(await edit.evaluate(element => !!element.closest('[inert]')))
    await next()
    await guide.getByRole('heading', { name: 'Your report, explained', exact: true }).waitFor()
    assert.equal(new URL(page.url()).searchParams.get('scope'), 'Personal')
    await page.locator('[data-tutorial-id="annual-tour-context"].tutorial-task-target').waitFor()
    } else if (tour === 'activity') {
      await next()
      await page.locator('[data-tutorial-id="activity-tour-from"]').fill('2026-01-01')
      const filtered = page.waitForResponse(response => response.url().includes('/audit-events?') && response.url().includes('fromDate=2026-01-01'))
      await page.getByRole('button', { name: 'Apply filters', exact: true }).click(); await filtered
      await next()
      if (scenario !== 'empty-viewer') {
        await page.getByText('View details', { exact: true }).first().click()
        assert.ok(await page.locator('.activity-details').first().evaluate(element => element.open))
      } else await page.getByRole('heading', { name: 'No activity found', exact: true }).waitFor()
      await next()
      if (scenario !== 'empty-viewer') {
        const paged = page.waitForResponse(response => response.url().includes('/audit-events?') && new URL(response.url()).searchParams.get('page') === '2')
        await page.getByRole('navigation', { name: 'Activity pages', exact: true }).getByRole('button', { name: 'Next', exact: true }).click(); await paged
      }
      await next()
      await guide.getByRole('heading', { name: 'History is not Undo', exact: true }).waitFor()
    } else if (tour === 'export') {
      await page.locator('[data-tutorial-id="transaction-tour-description"]').fill('QA ONLY')
      assert.ok(await guide.getByRole('button', { name: 'Next', exact: true }).isDisabled())
      await page.getByRole('button', { name: 'Apply filters', exact: true }).click()
      await next(); await next(); await next()
      await guide.getByRole('heading', { name: 'Download only if you want it', exact: true }).waitFor()
      assert.equal(exports, 0)
      if (scenario === 'normal') {
        const download = page.waitForEvent('download')
        await page.getByRole('button', { name: 'Export matching transactions', exact: true }).click(); await download
      } else if (scenario === 'failed-read') {
        await page.getByRole('button', { name: 'Export matching transactions', exact: true }).click()
        await guide.getByText('Needs attention').waitFor()
        assert.ok(await guide.getByRole('button', { name: 'Next', exact: true }).isDisabled())
        await page.locator('[data-tutorial-id="read-tour-reload"]').click()
        assert.equal(exports, 1)
      }
      await next()
      await guide.getByRole('heading', { name: 'Your records stay unchanged', exact: true }).waitFor()
    } else {
      await page.getByRole('button', { name: 'Customize dashboard', exact: true }).click()
      await next()
      if (scenario !== 'empty-viewer') await page.getByRole('button', { name: '+ Recent transactions', exact: true }).click()
      await next()
      if (scenario !== 'empty-viewer') await page.getByRole('button', { name: 'Move Recent transactions earlier', exact: true }).click()
      await next()
      if (scenario !== 'empty-viewer') await page.locator('[data-tutorial-id="dashboard-tour-columns"]').getByRole('button', { name: '2', exact: true }).click()
      await next()
      assert.equal(layoutSaves, 0)
      if (scenario === 'empty-viewer') await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      else {
        await page.getByRole('button', { name: 'Save layout', exact: true }).click()
        if (scenario === 'failed-read') {
          await page.getByRole('button', { name: 'Check saved layout', exact: true }).click()
        }
      }
      await next()
      await guide.getByRole('heading', { name: 'Your dashboard is ready', exact: true }).waitFor()
    }
    await page.screenshot({ path: resolve(output, `${tour}-${width}-${scenario}-complete.png`) })
    assert.ok(await guide.evaluate(element => { const box = element.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight && box.right <= innerWidth }))
    const completion = page.waitForResponse(response => response.request().method() === 'PUT' && response.request().postDataJSON()?.status === 'Completed')
    await guide.getByRole('button', { name: tour === 'totals' ? 'Continue checking this report' : tour === 'dashboard' ? 'Continue to Dashboard' : tour === 'export' ? 'Continue with transactions' : 'Continue reviewing', exact: true }).click(); await completion
    assert.equal(checkpoint.status, 'Completed'); assert.equal(new URL(page.url()).pathname, tour === 'annual' || tour === 'totals' ? '/budgeting/annual-overview' : tour === 'activity' ? '/activity' : tour === 'export' ? '/transactions' : '/dashboard')
    assert.equal(exports, tour === 'export' && scenario !== 'empty-viewer' ? 1 : 0)
    assert.equal(downloads, tour === 'export' && scenario === 'normal' ? 1 : 0)
    assert.equal(layoutSaves, tour === 'dashboard' && scenario !== 'empty-viewer' ? 1 : 0)
    assert.equal(await page.locator('[data-tutorial-inert]').count(), 0)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    results.push({ tour, width, scenario }); console.log(`${tour} ${width}px: ${scenario}`)
    await context.close()
  }
  assert.deepEqual(errors, [])
  await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2))
  console.log(`${results.length} planned tutorial cases passed; only deliberate layout preferences and progress written, no financial writes/database/email`)
} finally { await browser?.close(); await server.close() }
