// Synthetic monthly/annual plans; every mutation is intercepted, no live data.
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
const output = resolve(root, 'artifacts/lifecycle-tutorial-qa'); await mkdir(output, { recursive: true })
const server = await createServer({ root: client, configFile: false, plugins: [react()], server: { host: '127.0.0.1', port: 4205, strictPort: true } })
const results = [], errors = []; let browser
try {
  await server.listen(); browser = await chromium.launch({ headless: true, ...(process.env.BUDGETAPP_QA_BROWSER_PATH ? { executablePath: process.env.BUDGETAPP_QA_BROWSER_PATH } : {}) })
  const supportedScenarios = ['copy', 'existing-copy', 'reopen', 'already-open', 'return', 'replace', 'cancel-replace', 'lost-copy', 'lost-allocation', 'viewer']
  const widths = process.argv[2] ? [Number(process.argv[2])] : [1440, 390, 320]
  const scenarios = process.argv[3] ? [process.argv[3]] : supportedScenarios
  assert.ok(widths.every(width => [1440, 390, 320].includes(width)))
  assert.ok(scenarios.every(scenario => supportedScenarios.includes(scenario)))
  for (const width of widths) for (const scenario of scenarios) {
    const context = await browser.newContext({ viewport: { width, height: width === 320 ? 740 : 900 }, reducedMotion: 'reduce' }), page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message)); let acceptDialog = true; page.on('dialog', dialog => acceptDialog ? dialog.accept() : dialog.dismiss())
    const now = new Date(), year = now.getFullYear(), month = now.getMonth() + 1, absent = ['copy', 'lost-copy'].includes(scenario), replacement = ['replace', 'cancel-replace', 'lost-allocation'].includes(scenario)
    const budget = { ...responseFor(`/api/households/layout-household/budgets/${year}/${month}`), year, month, id: absent ? null : 'layout-budget', status: absent ? null : scenario === 'reopen' ? 'Closed' : ['already-open', 'return'].includes(scenario) ? 'Active' : 'Draft' }
    let copies = 0, statuses = 0, allocations = 0, checkpoint = null
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method()
      if (url.origin !== 'http://127.0.0.1:4205') { errors.push('External request blocked'); return route.abort() }
      if (!path.startsWith('/api/')) return route.continue()
      if (method === 'GET' && path === '/api/auth/antiforgery') return route.fulfill({ json: { token: 'synthetic' } })
      if (method === 'PUT' && path === '/api/tutorial-progress/budget-lifecycle') {
        const body = request.postDataJSON(); assert.deepEqual(Object.keys(body).sort(), ['currentStepIndex', 'status', 'tutorialVersion']); checkpoint = { ...body, tutorialKey: 'budget-lifecycle', startedAtUtc: '', updatedAtUtc: '', completedAtUtc: null, dismissedAtUtc: null }; return route.fulfill({ json: checkpoint })
      }
      if (method === 'POST' && path.endsWith('/copy')) {
        assert.ok(absent); assert.equal(++copies, 1); assert.notEqual(request.postDataJSON().sourceMonth, month); budget.id = 'copied-budget'; budget.status = 'Draft'
        return scenario === 'lost-copy' ? route.abort() : route.fulfill({ json: budget })
      }
      if (method === 'POST' && (path.endsWith('/reopen') || path.endsWith('/return-to-draft'))) {
        assert.ok(['reopen', 'return'].includes(scenario)); assert.equal(++statuses, 1); budget.status = scenario === 'return' ? 'Draft' : 'Active'; return route.fulfill({ json: budget })
      }
      if (method === 'POST' && path.endsWith('/allocate')) {
        assert.ok(['replace', 'lost-allocation'].includes(scenario)); assert.equal(++allocations, 1); const input = request.postDataJSON(); assert.deepEqual(input.months, [{ year, month }]); assert.equal(input.replaceExistingDrafts, true)
        budget.categories[0].budgetedAmount = 200
        return scenario === 'lost-allocation' ? route.abort() : route.fulfill({ json: { createdCount: 0, replacedDraftCount: 1, skippedCount: 0, months: [{ year, month, result: 'Replaced', budgetId: budget.id }] } })
      }
      if (method !== 'GET') { errors.push(`Unexpected save/delete ${method} ${path}`); return route.abort() }
      if (path === '/api/tutorial-progress') return route.fulfill({ json: checkpoint ? [checkpoint] : [] })
      if (path.endsWith('/budgets')) return route.fulfill({ json: [{ id: 'copy-source', year: month === 1 ? year - 1 : year, month: month === 1 ? 12 : month - 1, status: 'Active' }, ...(budget.id ? [{ id: budget.id, year, month, status: budget.status }] : [])] })
      if (/\/budgets\/\d{4}\/\d{1,2}$/.test(path)) return route.fulfill({ json: budget })
      try { return route.fulfill({ json: responseFor(path, { viewer: scenario === 'viewer' }) }) } catch (error) { errors.push(error.message); return route.abort() }
    })
    const clickPage = async locator => {
      await locator.scrollIntoViewIfNeeded(); await locator.evaluate(element => {
        const header = document.querySelector('.app-context-header')?.getBoundingClientRect().bottom ?? 128, coach = document.querySelector('.tutorial-coach-card')?.getBoundingClientRect().top ?? innerHeight, box = element.getBoundingClientRect()
        if (box.top < header + 8 || box.bottom > coach - 8) window.scrollBy(0, box.top - header - 16)
      }); await locator.click()
    }
    await page.goto('http://127.0.0.1:4205/tutorials'); await page.locator('.tutorial-card').filter({ has: page.getByRole('heading', { name: 'Copy, reopen or replace budgets', exact: true }) }).getByRole('button', { name: 'Start tutorial', exact: true }).click()
    const guide = page.getByRole('region', { name: 'Copy, reopen or replace budgets tutorial controls' }), next = () => guide.getByRole('button', { name: 'Next', exact: true }).click()
    if (scenario === 'viewer') {
      await page.getByText('Your current role cannot change this budget. You can exit without changing it.', { exact: true }).waitFor()
      assert.ok(await guide.getByRole('button', { name: 'Copy a budget', exact: true }).isDisabled()); await guide.getByRole('button', { name: 'Exit tutorial', exact: true }).click(); assert.equal(copies + statuses + allocations, 0)
      results.push({ width, scenario }); await context.close(); continue
    }
    await guide.getByRole('button', { name: scenario.includes('copy') ? 'Copy a budget' : ['reopen', 'already-open'].includes(scenario) ? 'Reopen a Closed budget' : 'Return to Draft / replace', exact: true }).click()
    await guide.getByRole('button', { name: 'Use this month', exact: true }).click(); assert.equal(copies + statuses + allocations, 0)
    if (absent) { await clickPage(page.getByRole('button', { name: 'Copy selected month', exact: true })); if (scenario === 'lost-copy') await clickPage(page.getByRole('button', { name: 'Check saved budget', exact: true })) }
    if (scenario === 'reopen') await clickPage(page.getByRole('button', { name: 'Reopen budget', exact: true }))
    if (scenario === 'return') await clickPage(page.getByRole('button', { name: 'Return to draft', exact: true }))
    await next()
    if (replacement) {
      await guide.getByRole('button', { name: 'Inspect Draft replacement', exact: true }).click()
      await clickPage(page.getByRole('button', { name: 'Select none', exact: true })); await clickPage(page.getByRole('checkbox', { name: `Create draft for ${new Intl.DateTimeFormat(undefined, { month: 'long' }).format(now)} ${year}`, exact: true }))
      await clickPage(page.getByRole('checkbox', { name: 'Replace amounts in existing Draft budgets after confirmation', exact: true })); await next(); acceptDialog = scenario !== 'cancel-replace'
      await clickPage(page.getByRole('button', { name: 'Create selected drafts', exact: true })); acceptDialog = true
      if (scenario === 'lost-allocation') await clickPage(page.getByRole('button', { name: 'Check saved annual plan', exact: true }))
      if (scenario !== 'replace') await guide.getByRole('button', { name: 'Keep checked saved state', exact: true }).click(); else await next()
    } else await guide.getByRole('button', { name: 'Keep current amounts', exact: true }).click()
    const ending = guide.getByRole('button', { name: 'Continue budgeting', exact: true })
    for (const control of [ending, guide.getByRole('button', { name: 'Exit tutorial', exact: true })]) assert.ok(await control.evaluate(element => {
      const box = element.getBoundingClientRect(), card = element.closest('.tutorial-coach-card').getBoundingClientRect()
      return box.top >= card.top && box.bottom <= card.bottom && box.left >= card.left && box.right <= card.right
    }), 'Ending and Exit must be visible without scrolling the coach')
    await page.screenshot({ path: resolve(output, `${width}-${scenario}-complete.png`) }); assert.ok(await guide.evaluate(element => { const box = element.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight && box.right <= innerWidth }))
    const done = page.waitForResponse(response => response.request().method() === 'PUT' && response.request().postDataJSON()?.status === 'Completed')
    await ending.click(); await done
    assert.equal(checkpoint.status, 'Completed'); assert.equal(copies, absent ? 1 : 0); assert.equal(statuses, ['reopen', 'return'].includes(scenario) ? 1 : 0); assert.equal(allocations, ['replace', 'lost-allocation'].includes(scenario) ? 1 : 0)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); results.push({ width, scenario }); console.log(`${width}px: ${scenario}`); await context.close()
  }
  const resultsFile = process.argv[2] ? `results-${process.argv[2]}-${process.argv[3] ?? 'all'}.json` : 'results.json'
  assert.deepEqual(errors, []); await writeFile(resolve(output, resultsFile), JSON.stringify(results, null, 2)); console.log(`${results.length} lifecycle cases passed; synthetic plans only`)
} finally { await browser?.close(); await server.close() }
