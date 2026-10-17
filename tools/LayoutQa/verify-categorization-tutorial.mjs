// All data and write responses are fictional/intercepted; never a live database.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { responseFor, importId } from './fixtures.mjs'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), client = resolve(root, 'BudgetApp/budgetapp.client')
const require = createRequire(resolve(client, 'package.json'))
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href)
const react = (await import(pathToFileURL(require.resolve('@vitejs/plugin-react')).href)).default
const { chromium } = await import(process.env.BUDGETAPP_QA_PLAYWRIGHT_PATH ? pathToFileURL(process.env.BUDGETAPP_QA_PLAYWRIGHT_PATH).href : 'playwright')
const output = resolve(root, 'artifacts/categorization-tutorial-qa'); await mkdir(output, { recursive: true })
const server = await createServer({ root: client, configFile: false, plugins: [react()], server: { host: '127.0.0.1', port: 4202, strictPort: true } })
const results = [], errors = []; let browser
try {
  await server.listen(); browser = await chromium.launch({ headless: true, ...(process.env.BUDGETAPP_QA_BROWSER_PATH ? { executablePath: process.env.BUDGETAPP_QA_BROWSER_PATH } : {}) })
  for (const width of [1440, 390, 320]) for (const scenario of ['posted', 'staged', 'viewer', 'posted-rule', 'staged-rule', 'new-rule', 'lost-reply', 'failed-read']) {
    const context = await browser.newContext({ viewport: { width, height: width === 320 ? 740 : 900 }, reducedMotion: 'reduce' })
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept())
    const staged = scenario.startsWith('staged'), optional = !['posted', 'staged'].includes(scenario), creates = ['new-rule', 'lost-reply'].includes(scenario)
    const rows = responseFor('/api/households/layout-household/transactions').items.slice(0, 1).map(row => ({ ...row, canEdit: scenario !== 'viewer' }))
    const rules = responseFor('/api/households/layout-household/categorization-rules')
    let writes = 0, checkpoint = null, failRead = scenario === 'failed-read'
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method()
      if (url.origin !== 'http://127.0.0.1:4202') { errors.push('External request blocked'); return route.abort() }
      if (!path.startsWith('/api/')) return route.continue()
      if (method === 'GET' && path === '/api/auth/antiforgery') return route.fulfill({ json: { token: 'synthetic' } })
      if (method === 'PUT' && path === '/api/tutorial-progress/categorize-transactions') {
        const body = request.postDataJSON(); assert.deepEqual(Object.keys(body).sort(), ['currentStepIndex', 'status', 'tutorialVersion'])
        checkpoint = { ...body, tutorialKey: 'categorize-transactions', startedAtUtc: '', updatedAtUtc: '', completedAtUtc: null, dismissedAtUtc: null }
        return route.fulfill({ json: checkpoint })
      }
      if (method === 'POST' && path.endsWith('/categorization-rules')) {
        assert.ok(creates); assert.equal(++writes, 1); const input = request.postDataJSON(); assert.equal(input.targetCategoryId, 'housing')
        rules.push({ ...input, id: 'created-rule', priority: 1, isActive: true })
        return scenario === 'lost-reply' ? route.abort() : route.fulfill({ json: { id: 'created-rule' } })
      }
      if (method !== 'GET') { errors.push(`Unexpected financial/approval/rule application ${method} ${path}`); return route.abort() }
      if (path === '/api/tutorial-progress') return route.fulfill({ json: checkpoint ? [checkpoint] : [] })
      if (path.endsWith('/transactions')) return route.fulfill({ json: { items: rows, hasMore: false, page: 1, pageSize: 100, totalCount: rows.length, totalPages: 1, totalsByCurrency: { CAD: rows[0].amount } } })
      if (path.endsWith('/categorization-rules')) return failRead ? route.fulfill({ status: 503, json: { detail: 'Synthetic rules read failure' } }) : route.fulfill({ json: rules })
      try { return route.fulfill({ json: responseFor(path, { viewer: scenario === 'viewer' }) }) }
      catch (error) { errors.push(error.message); return route.abort() }
    })
    const clickPage = async locator => {
      await locator.scrollIntoViewIfNeeded(); await locator.evaluate(element => {
        const header = document.querySelector('.app-context-header')?.getBoundingClientRect().bottom ?? 128
        const coach = document.querySelector('.tutorial-coach-card')?.getBoundingClientRect().top ?? innerHeight, box = element.getBoundingClientRect()
        if (box.top < header + 8 || box.bottom > coach - 8) window.scrollBy(0, box.top - header - 16)
      }); await locator.click()
    }
    await page.goto('http://127.0.0.1:4202/tutorials')
    await page.locator('.tutorial-card').filter({ has: page.getByRole('heading', { name: 'Categorize transactions', exact: true }) }).getByRole('button', { name: 'Start tutorial', exact: true }).click()
    const guide = page.getByRole('region', { name: 'Categorize transactions tutorial controls' })
    const next = () => guide.getByRole('button', { name: 'Next', exact: true }).click()
    await guide.getByRole('button', { name: staged ? 'Staged import rows' : 'Saved Transactions', exact: true }).click()
    if (staged) await page.locator('select[data-tutorial-id="import-tour-file"]').selectOption(importId)
    else await page.getByLabel('Transaction to review').selectOption(rows[0].id)
    await guide.getByRole('button', { name: 'Use this selection', exact: true }).click(); await next(); await next(); assert.equal(writes, 0)
    if (!optional) await guide.getByRole('button', { name: 'Finish without a rule', exact: true }).click()
    else {
      await guide.getByRole('button', { name: 'Inspect or create a rule', exact: true }).click()
      if (failRead) { await guide.getByText('Needs attention').waitFor(); failRead = false; await clickPage(page.getByRole('button', { name: 'Retry loading', exact: true })) }
      await page.getByLabel('Rule to review').selectOption(creates ? 'new' : 'layout-rule'); await next()
      if (creates) {
        await clickPage(page.getByLabel('Rule name', { exact: true })); await page.getByLabel('Rule name', { exact: true }).fill('Synthetic rule')
        await clickPage(page.getByLabel('Match text', { exact: true })); await page.getByLabel('Match text', { exact: true }).fill('Synthetic')
        await page.getByLabel('Category', { exact: true }).selectOption('housing'); await clickPage(page.getByRole('button', { name: 'Create rule', exact: true }))
        if (scenario === 'lost-reply') {
          await page.getByRole('button', { name: 'Check saved rules', exact: true }).waitFor()
          assert.ok(await page.getByLabel('Rule to review').isDisabled()); await clickPage(page.getByRole('button', { name: 'Check saved rules', exact: true }))
          await page.getByLabel('Rule to review').selectOption('created-rule'); await guide.getByRole('button', { name: 'Back', exact: true }).click(); await next()
        }
      }
      await next(); await next()
    }
    await page.screenshot({ path: resolve(output, `${width}-${scenario}-complete.png`) })
    assert.ok(await guide.evaluate(element => { const box = element.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight && box.right <= innerWidth }))
    const done = page.waitForResponse(response => response.request().method() === 'PUT' && response.request().postDataJSON()?.status === 'Completed')
    await guide.getByRole('button', { name: 'Continue categorizing', exact: true }).click(); await done
    assert.equal(checkpoint.status, 'Completed'); assert.equal(writes, creates ? 1 : 0)
    assert.equal(await page.locator('[data-tutorial-inert]').count(), 0); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    results.push({ width, scenario }); console.log(`${width}px: ${scenario}`); await context.close()
  }
  assert.deepEqual(errors, []); await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2))
  console.log(`${results.length} categorization tutorial cases passed; no live data or automatic correction/rule application`)
} finally { await browser?.close(); await server.close() }
