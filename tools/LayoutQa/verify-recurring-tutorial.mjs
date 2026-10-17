// Disposable, intercepted fixtures only. No real server, database or email.
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
const output = resolve(root, 'artifacts/recurring-tutorial-qa'); await mkdir(output, { recursive: true })
const server = await createServer({ root: client, configFile: false, plugins: [react()], server: { host: '127.0.0.1', port: 4197, strictPort: true } })
const results = [], errors = []; let browser
try {
  await server.listen()
  browser = await chromium.launch({ headless: true, ...(process.env.BUDGETAPP_QA_BROWSER_PATH ? { executablePath: process.env.BUDGETAPP_QA_BROWSER_PATH } : {}) })
  for (const width of [1440, 390, 320]) for (const scenario of ['existing', 'new', 'viewer', 'lost-reply']) {
    const context = await browser.newContext({ viewport: { width, height: width === 320 ? 740 : 900 }, reducedMotion: 'reduce' })
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept())
    let items = responseFor('/api/households/layout-household/recurring-expenses'), checkpoint = null, adds = 0, builds = 0
    let failRead = scenario === 'lost-reply', built = scenario !== 'new'
    if (scenario === 'viewer') items = items.map(item => ({ ...item, scope: 'Personal' }))
    if (scenario === 'new' || scenario === 'lost-reply') items = []
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method()
      if (url.origin !== 'http://127.0.0.1:4197') { errors.push('External request blocked'); return route.abort() }
      if (!path.startsWith('/api/')) return route.continue()
      if (method === 'GET' && path === '/api/auth/antiforgery') return route.fulfill({ json: { token: 'synthetic' } })
      if (method === 'PUT' && path === '/api/tutorial-progress/recurring-expenses') {
        const body = request.postDataJSON(); assert.deepEqual(Object.keys(body).sort(), ['currentStepIndex', 'status', 'tutorialVersion'])
        checkpoint = { ...body, tutorialKey: 'recurring-expenses', startedAtUtc: '', updatedAtUtc: '', completedAtUtc: null, dismissedAtUtc: null }
        return route.fulfill({ json: checkpoint })
      }
      if (method === 'POST' && path.endsWith('/recurring-expenses')) {
        assert.ok(['new', 'lost-reply'].includes(scenario)); assert.equal(++adds, 1)
        items = [{ ...responseFor('/api/households/layout-household/recurring-expenses')[0], ...request.postDataJSON(), id: 'qa-created' }]
        if (scenario === 'lost-reply') return route.abort()
        return route.fulfill({ json: { id: 'qa-created' } })
      }
      if (method === 'POST' && path.endsWith('/from-recurring')) {
        assert.equal(scenario, 'new'); assert.equal(++builds, 1); built = true
        const base = responseFor(path.replace('/from-recurring', ''), { emptyBudget: false })
        return route.fulfill({ json: { ...base, year: Number(path.split('/').at(-3)), month: Number(path.split('/').at(-2)), scope: request.postDataJSON().scope } })
      }
      if (method !== 'GET') { errors.push(`Unexpected write ${method} ${path}`); return route.abort() }
      if (path === '/api/tutorial-progress') return route.fulfill({ json: checkpoint ? [checkpoint] : [] })
      if (path.endsWith('/recurring-expenses')) return failRead ? route.fulfill({ status: 503, json: { detail: 'Synthetic read failure' } }) : route.fulfill({ json: items })
      let data
      try { data = responseFor(path, { viewer: scenario === 'viewer', emptyBudget: !built }) }
      catch (error) { errors.push(error.message); return route.abort() }
      if (path.endsWith('/categories')) data = [{ ...data[0], children: [{ id: 'rent', name: 'Rent', type: 'Expense', displayOrder: 0, isActive: true, children: [] }] }]
      if (/\/budgets\/\d{4}\/\d{1,2}$/.test(path)) data = { ...data, year: Number(path.split('/').at(-2)), month: Number(path.split('/').at(-1)), scope: url.searchParams.get('scope') }
      return route.fulfill({ json: data })
    })
    await page.goto('http://127.0.0.1:4197/tutorials')
    await page.locator('.tutorial-card').filter({ has: page.getByRole('heading', { name: 'Plan recurring expenses', exact: true }) }).getByRole('button', { name: 'Start tutorial', exact: true }).click()
    const guide = page.getByRole('region', { name: 'Plan recurring expenses tutorial controls' })
    const next = () => guide.getByRole('button', { name: 'Next', exact: true }).click()
    if (failRead) {
      await guide.getByText('Needs attention').waitFor(); assert.ok(await guide.getByRole('button', { name: 'Use this item', exact: true }).isDisabled())
      failRead = false; await page.getByRole('button', { name: 'Retry loading', exact: false }).click()
    }
    await page.getByLabel('Use an existing item or add a new one').selectOption(items.length ? items[0].id : 'new')
    await guide.getByRole('button', { name: 'Use this item', exact: true }).click()
    if (items.length) await page.getByRole('button', { name: 'Edit', exact: true }).click()
    else {
      await page.getByLabel('Item name', { exact: true }).fill('QA ONLY monthly expectation')
      await page.getByLabel('Monthly amount', { exact: false }).fill('125.50')
      await page.getByLabel('Subcategory', { exact: true }).selectOption('rent')
    }
    await next(); await next(); await next()
    assert.equal(adds, 0)
    if (items.length) await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    else await page.getByRole('button', { name: 'Add recurring expense', exact: true }).click()
    if (scenario === 'lost-reply') {
      await page.getByRole('button', { name: 'Check saved list', exact: true }).click()
      assert.ok(await page.getByRole('button', { name: 'Add recurring expense', exact: true }).isDisabled())
      await guide.getByText('More details', { exact: true }).click()
      await guide.getByRole('button', { name: 'Restart task selection', exact: true }).click()
      await page.getByLabel('Use an existing item or add a new one').selectOption('qa-created')
      await guide.getByRole('button', { name: 'Use this item', exact: true }).click()
      await page.getByRole('button', { name: 'Edit', exact: true }).click()
      await next(); await next(); await next(); await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    }
    await next()
    if (scenario === 'viewer' || scenario === 'lost-reply') {
      if (scenario === 'viewer') assert.ok(await guide.getByRole('button', { name: 'Build a monthly draft', exact: true }).isDisabled())
      await guide.getByRole('button', { name: 'Finish here', exact: true }).click()
    } else {
      await guide.getByRole('button', { name: 'Build a monthly draft', exact: true }).click(); await next()
      if (scenario === 'new') await page.getByRole('button', { name: 'Build from recurring expenses', exact: true }).click()
      else assert.equal(await page.getByRole('button', { name: 'Build from recurring expenses', exact: true }).count(), 0)
      await next()
    }
    await page.screenshot({ path: resolve(output, `${width}-${scenario}-complete.png`) })
    assert.ok(await guide.evaluate(element => { const box = element.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight && box.right <= innerWidth }))
    const saved = page.waitForResponse(response => response.request().method() === 'PUT' && response.request().postDataJSON()?.status === 'Completed')
    await guide.getByRole('button', { name: scenario === 'viewer' || scenario === 'lost-reply' ? 'Continue recurring expenses' : 'Continue budgeting', exact: true }).click(); await saved
    assert.equal(checkpoint.status, 'Completed'); assert.equal(adds, scenario === 'new' || scenario === 'lost-reply' ? 1 : 0); assert.equal(builds, scenario === 'new' ? 1 : 0)
    assert.equal(await page.locator('[data-tutorial-inert]').count(), 0)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    results.push({ width, scenario }); console.log(`${width}px: ${scenario}`); await context.close()
  }
  assert.deepEqual(errors, []); await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2))
  console.log(`${results.length} recurring tutorial cases passed; only explicit synthetic expectation/budget commands, no DB/email`)
} finally { await browser?.close(); await server.close() }
