// Intercepted annual/monthly plans only. No application database or real ledger.
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
const output = resolve(root, 'artifacts/annual-budget-tutorial-qa'); await mkdir(output, { recursive: true })
const server = await createServer({ root: client, configFile: false, plugins: [react()], server: { host: '127.0.0.1', port: 4206, strictPort: true } })
const results = [], errors = []; let browser
try {
  await server.listen(); browser = await chromium.launch({ headless: true, ...(process.env.BUDGETAPP_QA_BROWSER_PATH ? { executablePath: process.env.BUDGETAPP_QA_BROWSER_PATH } : {}) })
  const supportedScenarios = ['annual-only', 'existing', 'new-month', 'closed', 'active', 'zero-save', 'cancel-allocation', 'lost-allocation', 'viewer', 'failed-target-read', 'personal-back']
  const widths = process.argv[2] ? [Number(process.argv[2])] : [1440, 390, 320]
  const scenarios = process.argv[3] ? [process.argv[3]] : supportedScenarios
  assert.ok(widths.every(width => [1440, 390, 320].includes(width)))
  assert.ok(scenarios.every(scenario => supportedScenarios.includes(scenario)))
  for (const width of widths) for (const scenario of scenarios) {
    const context = await browser.newContext({ viewport: { width, height: width === 320 ? 740 : 900 }, reducedMotion: 'reduce' }), page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message)); let acceptDialog = true; page.on('dialog', dialog => acceptDialog ? dialog.accept() : dialog.dismiss())
    const now = new Date(), year = now.getFullYear(), month = now.getMonth() + 1, missing = ['new-month', 'cancel-allocation', 'lost-allocation'].includes(scenario), status = scenario === 'closed' ? 'Closed' : scenario === 'active' ? 'Active' : 'Draft'
    const annual = { ...responseFor(`/api/households/layout-household/yearly-plans/${year}`), fiscalYearStartYear: year }
    let options = missing ? [] : [{ id: 'layout-budget', year, month, status }], saves = 0, allocations = 0, checkpoint = null, failRead = scenario === 'failed-target-read'
    if (scenario === 'zero-save') { annual.id = null; annual.categories = annual.categories.map(root => ({ ...root, annualTargetAmount: null, equivalentMonthlyAmount: null })) }
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method()
      if (url.origin !== 'http://127.0.0.1:4206') { errors.push('External request blocked'); return route.abort() }
      if (!path.startsWith('/api/')) return route.continue()
      if (method === 'GET' && path === '/api/auth/antiforgery') return route.fulfill({ json: { token: 'synthetic' } })
      if (method === 'PUT' && path === '/api/tutorial-progress/budget-from-annual-targets') {
        const body = request.postDataJSON(); assert.deepEqual(Object.keys(body).sort(), ['currentStepIndex', 'status', 'tutorialVersion']); checkpoint = { ...body, tutorialKey: 'budget-from-annual-targets', startedAtUtc: '', updatedAtUtc: '', completedAtUtc: null, dismissedAtUtc: null }; return route.fulfill({ json: checkpoint })
      }
      if (method === 'PUT' && /\/yearly-plans\/\d{4}$/.test(path)) {
        assert.equal(scenario, 'zero-save'); assert.equal(++saves, 1); const input = request.postDataJSON(); assert.deepEqual(input.lines, [{ categoryId: 'budget-category-0', annualTargetAmount: 0 }]); annual.id = 'saved-annual'; annual.categories[0].annualTargetAmount = 0; return route.fulfill({ json: annual })
      }
      if (method === 'POST' && path.endsWith('/allocate')) {
        assert.ok(['new-month', 'lost-allocation'].includes(scenario)); assert.equal(++allocations, 1); const input = request.postDataJSON(); assert.deepEqual(input.months, [{ year, month }]); assert.equal(input.replaceExistingDrafts, false)
        options = [{ id: 'created-budget', year, month, status: 'Draft' }]
        return scenario === 'lost-allocation' ? route.abort() : route.fulfill({ json: { createdCount: 1, replacedDraftCount: 0, skippedCount: 0, months: [{ year, month, result: 'Created', budgetId: 'created-budget' }] } })
      }
      if (method !== 'GET') { errors.push(`Unexpected monthly edit/status/delete ${method} ${path}`); return route.abort() }
      if (path === '/api/tutorial-progress') return route.fulfill({ json: checkpoint ? [checkpoint] : [] })
      if (path.endsWith('/budgets')) return route.fulfill({ json: options })
      if (/\/yearly-plans\/\d{4}$/.test(path)) return failRead ? route.fulfill({ status: 503, json: { detail: 'Synthetic annual-target read failure' } }) : route.fulfill({ json: { ...annual, scope: url.searchParams.get('scope') } })
      if (/\/budgets\/\d{4}\/\d{1,2}$/.test(path)) return route.fulfill({ json: { ...responseFor(path), id: options[0]?.id ?? null, year, month, status: options[0]?.status ?? null, scope: url.searchParams.get('scope') } })
      try { return route.fulfill({ json: responseFor(path, { viewer: scenario === 'viewer' }) }) } catch (error) { errors.push(error.message); return route.abort() }
    })
    const clickPage = async locator => {
      await locator.scrollIntoViewIfNeeded(); await locator.evaluate(element => {
        const header = document.querySelector('.app-context-header')?.getBoundingClientRect().bottom ?? 128, coach = document.querySelector('.tutorial-coach-card')?.getBoundingClientRect().top ?? innerHeight, box = element.getBoundingClientRect()
        if (box.top < header + 8 || box.bottom > coach - 8) window.scrollBy(0, box.top - header - 16)
      }); await locator.click()
    }
    await page.goto('http://127.0.0.1:4206/tutorials'); await page.getByRole('button', { name: 'Start from annual targets', exact: true }).click()
    const guide = page.getByRole('region', { name: 'Budget from annual targets tutorial controls' }), next = () => guide.getByRole('button', { name: 'Next', exact: true }).click()
    if (scenario === 'viewer') { await guide.getByText('Your role cannot change this plan. You may inspect the page or Exit without changing it.', { exact: true }).waitFor(); assert.ok(await guide.getByRole('button', { name: 'Use this annual plan', exact: true }).isDisabled()); await guide.getByRole('button', { name: 'Exit tutorial', exact: true }).click(); results.push({ width, scenario }); await context.close(); continue }
    if (failRead) { await guide.getByText('Needs attention').waitFor(); failRead = false; await clickPage(page.getByRole('button', { name: 'Retry loading', exact: true })) }
    if (scenario === 'personal-back') await page.locator('[data-tutorial-id="annual-tour-selection"]').getByRole('combobox').last().selectOption('Personal')
    await guide.getByRole('button', { name: 'Use this annual plan', exact: true }).click()
    if (scenario === 'zero-save') { const amount = page.getByLabel('Sample category 1 overall annual target', { exact: true }); await clickPage(amount); await amount.fill('0') }
    await next()
    if (scenario === 'zero-save') await clickPage(page.getByRole('button', { name: 'Save annual targets', exact: true }))
    await next(); assert.equal(allocations, 0)
    let annualOnly = ['annual-only', 'zero-save', 'cancel-allocation'].includes(scenario)
    if (annualOnly && scenario !== 'cancel-allocation') await guide.getByRole('button', { name: 'Finish with annual targets only', exact: true }).click()
    else {
      await clickPage(page.getByRole('button', { name: 'Select none', exact: true })); await clickPage(page.getByRole('checkbox', { name: `Create draft for ${new Intl.DateTimeFormat(undefined, { month: 'long' }).format(now)} ${year}`, exact: true }))
      const replace = page.getByRole('checkbox', { name: 'Replace amounts in existing Draft budgets after confirmation', exact: true }); assert.ok(await replace.isDisabled()); assert.ok(!await replace.isChecked())
      await next()
      if (missing) {
        acceptDialog = scenario !== 'cancel-allocation'; await clickPage(page.getByRole('button', { name: 'Create selected drafts', exact: true })); acceptDialog = true
        if (scenario === 'lost-allocation') await clickPage(page.getByRole('button', { name: 'Check saved annual plan', exact: true }))
        if (scenario === 'cancel-allocation') await guide.getByRole('button', { name: 'Finish with annual targets only', exact: true }).click()
      }
      if (!annualOnly) {
        await next(); const link = () => page.getByRole('link', { name: new RegExp(`${new Intl.DateTimeFormat(undefined, { month: 'long' }).format(now)} ${year}`) })
        await clickPage(link())
        if (scenario === 'personal-back') {
          await guide.getByRole('button', { name: 'Back', exact: true }).click()
          assert.equal(await page.locator('[data-tutorial-id="annual-tour-selection"]').getByRole('combobox').last().inputValue(), 'Personal'); await clickPage(link())
        }
        await next(); await next()
      }
    }
    const ending = guide.getByRole('button', { name: annualOnly ? 'Continue annual targets' : 'Continue budgeting', exact: true })
    for (const control of [ending, guide.getByRole('button', { name: 'Exit tutorial', exact: true })]) assert.ok(await control.evaluate(element => {
      const box = element.getBoundingClientRect(), card = element.closest('.tutorial-coach-card').getBoundingClientRect()
      return box.top >= card.top && box.bottom <= card.bottom && box.left >= card.left && box.right <= card.right
    }), 'Ending and Exit must be visible without scrolling the coach')
    await page.screenshot({ path: resolve(output, `${width}-${scenario}-complete.png`) }); assert.ok(await guide.evaluate(element => { const box = element.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight && box.right <= innerWidth }))
    const done = page.waitForResponse(response => response.request().method() === 'PUT' && response.request().postDataJSON()?.status === 'Completed')
    await ending.click(); await done
    assert.equal(checkpoint.status, 'Completed'); assert.equal(saves, scenario === 'zero-save' ? 1 : 0); assert.equal(allocations, ['new-month', 'lost-allocation'].includes(scenario) ? 1 : 0)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); results.push({ width, scenario }); console.log(`${width}px: ${scenario}`); await context.close()
  }
  const resultsFile = process.argv[2] ? `results-${process.argv[2]}-${process.argv[3] ?? 'all'}.json` : 'results.json'
  assert.deepEqual(errors, []); await writeFile(resolve(output, resultsFile), JSON.stringify(results, null, 2)); console.log(`${results.length} annual-budget cases passed; synthetic plans only`)
} finally { await browser?.close(); await server.close() }
