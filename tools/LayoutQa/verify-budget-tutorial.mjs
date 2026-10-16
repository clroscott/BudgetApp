// Synthetic UI-only QA. Every API call is intercepted; no DB, real email or financial server.
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
const output = resolve(root, 'artifacts/budget-tutorial-qa')
await mkdir(output, { recursive: true })
const server = await createServer({ root: client, configFile: false, plugins: [react()], server: { host: '127.0.0.1', port: 4195, strictPort: true } })
const results = [], errors = [], key = 'build-first-budget'
let browser
try {
  await server.listen()
  browser = await chromium.launch({ headless: true, ...(process.env.BUDGETAPP_QA_BROWSER_PATH ? { executablePath: process.env.BUDGETAPP_QA_BROWSER_PATH } : {}) })
  for (const width of [1440, 390, 320]) for (const scenario of ['new', 'draft', 'active', 'closed', 'viewer', 'failed-read', 'lost-create', 'lost-save', 'lost-activate']) {
    const context = await browser.newContext({ viewport: { width, height: width === 320 ? 740 : width === 390 ? 844 : 900 }, reducedMotion: 'reduce' })
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    page.on('dialog', dialog => dialog.accept())
    const absent = ['new', 'lost-create'].includes(scenario)
    const fixture = responseFor('/api/households/layout-household/budgets/2026/10')
    const base = fixture.categories[0]
    let budget = { ...fixture, id: absent ? null : fixture.id, status: absent ? null : scenario === 'active' ? 'Active' : scenario === 'closed' ? 'Closed' : 'Draft',
      categories: [{ ...base, name: 'Groceries', budgetedAmount: absent ? null : 100 },
        { ...base, id: 'transport', name: 'Transport', budgetedAmount: null, children: [
          { ...base, id: 'fuel', name: 'Fuel', budgetedAmount: null }, { ...base, id: 'parking', name: 'Parking', budgetedAmount: null },
        ] },
        { ...base, id: 'housing', name: 'Housing', budgetedAmount: null }, { ...base, id: 'leisure', name: 'Leisure', budgetedAmount: null }] }
    let creates = 0, saves = 0, activates = 0, checkpoint = null
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method()
      if (url.origin !== 'http://127.0.0.1:4195') { errors.push('External request blocked'); return route.abort() }
      if (!path.startsWith('/api/')) return route.continue()
      if (method === 'GET' && path === '/api/auth/antiforgery') return route.fulfill({ json: { token: 'synthetic-only' } })
      if (method === 'PUT' && path === `/api/tutorial-progress/${key}`) {
        const body = request.postDataJSON()
        assert.deepEqual(Object.keys(body).sort(), ['currentStepIndex', 'status', 'tutorialVersion'])
        checkpoint = { ...body, tutorialKey: key, startedAtUtc: '2026-10-16', updatedAtUtc: '2026-10-16', completedAtUtc: null, dismissedAtUtc: null }
        return route.fulfill({ json: checkpoint })
      }
      if (method === 'POST' && /\/budgets\/\d+\/\d+$/.test(path)) {
        creates++; assert.ok(absent); assert.equal(creates, 1)
        const parts = path.split('/'); budget = { ...budget, id: 'created-budget', status: 'Draft', year: Number(parts.at(-2)), month: Number(parts.at(-1)), scope: request.postDataJSON().scope }
        if (scenario === 'lost-create') return route.abort()
        return route.fulfill({ json: budget })
      }
      if (method === 'PUT' && /\/budgets\/[^/]+$/.test(path)) {
        saves++; assert.ok(['new', 'lost-create', 'lost-save'].includes(scenario)); assert.equal(saves, 1)
        const lines = request.postDataJSON().lines
        budget = { ...budget, categories: budget.categories.map(category => ({ ...category,
          budgetedAmount: lines.find(line => line.categoryId === category.id)?.budgetedAmount ?? null,
          children: category.children.map(child => ({ ...child, budgetedAmount: lines.find(line => line.categoryId === child.id)?.budgetedAmount ?? null })),
        })) }
        if (scenario === 'lost-save') return route.abort()
        return route.fulfill({ json: budget })
      }
      if (method === 'POST' && path.endsWith('/activate')) {
        activates++; assert.ok(['new', 'lost-activate'].includes(scenario)); assert.equal(activates, 1)
        budget = { ...budget, status: 'Active' }
        if (scenario === 'lost-activate') return route.abort()
        return route.fulfill({ json: budget })
      }
      if (method !== 'GET') { errors.push(`Unexpected write blocked: ${path}`); return route.abort() }
      if (path === '/api/tutorial-progress') return route.fulfill({ json: checkpoint ? [checkpoint] : [] })
      if (/\/budgets\/\d+\/\d+$/.test(path)) {
        if (scenario === 'failed-read') return route.fulfill({ status: 503, json: { detail: 'Synthetic budget load failure' } })
        const parts = path.split('/'); budget = { ...budget, year: Number(parts.at(-2)), month: Number(parts.at(-1)), scope: url.searchParams.get('scope') ?? 'Household' }
        return route.fulfill({ json: budget })
      }
      try { return route.fulfill({ json: responseFor(path, { viewer: scenario === 'viewer' }) }) }
      catch (error) { errors.push(error.message); return route.abort() }
    })
    await page.goto('http://127.0.0.1:4195/tutorials')
    const card = page.locator('.tutorial-card').filter({ has: page.getByRole('heading', { name: 'Build your first budget', exact: true }) })
    await card.getByRole('button', { name: 'Start tutorial', exact: true }).click()
    const guide = page.getByRole('region', { name: 'Build your first budget tutorial controls' })
    const click = name => guide.getByRole('button', { name, exact: true }).click()
    const checkBottomHelp = async label => {
      const help = page.locator('.budget-action-help')
      if (!await help.isVisible()) return
      const checkClearance = async () => {
        // Scrolling reveals Back to top, which can wrap the mobile bar and
        // increase its reserved height on the next ResizeObserver delivery.
        try {
          await page.waitForFunction(() => {
            window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })
            const helpBox = document.querySelector('.budget-action-help').getBoundingClientRect()
            const barBox = document.querySelector('.budget-save-bar').getBoundingClientRect()
            return helpBox.bottom <= barBox.top - 8
          }, undefined, { timeout: 5000 })
        } catch {
          await page.screenshot({ path: resolve(output, `${width}-${scenario}-${label}-overlap.png`) })
          assert.fail(`Bottom help overlapped: ${JSON.stringify(await page.evaluate(() => ({
            help: document.querySelector('.budget-action-help').getBoundingClientRect().toJSON(),
            bar: document.querySelector('.budget-save-bar').getBoundingClientRect().toJSON(),
            reserved: document.querySelector('main').style.getPropertyValue('--budget-actions-height'),
            scrollY, scrollHeight: document.documentElement.scrollHeight, height: innerHeight,
          })))}`)
        }
      }
      await checkClearance()
      await help.locator('summary').click()
      await checkClearance()
      await page.screenshot({ path: resolve(output, `${width}-${scenario}-${label}-bottom-help.png`) })
      await help.locator('summary').click()
    }
    if (['closed', 'viewer', 'failed-read'].includes(scenario)) {
      await guide.getByText(scenario === 'closed' ? /This month is closed/ : scenario === 'viewer' ? /current role cannot edit/ : /Check the error on the page/).waitFor()
      assert.ok(await guide.getByRole('button', { name: 'Next', exact: true }).isDisabled())
      await click('Exit tutorial')
    } else {
      await click('Use this month')
      assert.equal(creates + saves + activates, 0)
      if (absent) {
        await page.getByRole('button', { name: 'Create blank budget', exact: true }).click()
        if (scenario === 'lost-create') await page.getByRole('button', { name: 'Check saved budget', exact: true }).click()
      }
      await click('Plan amounts')
      await page.locator('[data-tutorial-id="budget-tutorial-planning"]').waitFor()
      if (absent || scenario === 'lost-save') await page.getByRole('spinbutton', { name: 'Groceries budget', exact: true }).fill(scenario === 'new' ? '0' : '125.25')
      await click('Totals and breakdowns')
      if (scenario === 'new') {
        await page.locator('[data-tutorial-id="budget-tutorial-breakdown-mode"]').getByRole('button', { name: 'Detailed', exact: true }).click()
        await page.locator('[data-tutorial-id="budget-tutorial-breakdown-input"].tutorial-task-target').waitFor()
        await page.getByRole('spinbutton', { name: 'Fuel budget', exact: true }).fill('12.50')
        await page.getByRole('spinbutton', { name: 'Parking budget', exact: true }).fill('7.50')
        await page.screenshot({ path: resolve(output, `${width}-breakdown.png`) })
      }
      await click('Next category')
      await page.locator('[data-tutorial-id="budget-tutorial-category-two"].tutorial-task-target').waitFor()
      if (scenario === 'new') await page.getByRole('spinbutton', { name: 'Housing budget', exact: true }).fill('100')
      await click('One more category')
      await page.locator('[data-tutorial-id="budget-tutorial-category-three"].tutorial-task-target').waitFor()
      if (scenario === 'new') await page.getByRole('spinbutton', { name: 'Leisure budget', exact: true }).fill('20')
      await click('Review and save')
      if (absent || scenario === 'lost-save') {
        await page.locator('[data-tutorial-id="budget-tutorial-save"].tutorial-task-target').waitFor()
        const save = page.getByRole('button', { name: 'Save budget', exact: true })
        assert.ok(await save.evaluate(element => {
          const box = element.getBoundingClientRect(), coach = document.querySelector('.tutorial-coach-card').getBoundingClientRect()
          return box.top >= 0 && box.bottom <= coach.top
        }), 'Save button covered by coach')
        await page.screenshot({ path: resolve(output, `${width}-${scenario}-save.png`) })
        await save.click()
        if (scenario === 'lost-save') await page.getByRole('button', { name: 'Check saved budget', exact: true }).click()
      }
      await click('Draft or Active?')
      await guide.getByText(/Draft: saved, but still planning/).waitFor()
      assert.equal(activates, 0)
      await page.screenshot({ path: resolve(output, `${width}-${scenario}-draft-active.png`) })
      await click('Choose status')
      if (scenario === 'new' || scenario === 'lost-activate') {
        const activate = page.getByRole('button', { name: 'Activate', exact: true })
        await activate.click()
        if (scenario === 'lost-activate') await page.getByRole('button', { name: 'Check saved budget', exact: true }).click()
        await click('Verify budget')
      } else if (scenario === 'active') await click('Verify budget')
      else await click('Keep as draft')
      await guide.getByRole('heading', { name: 'Your monthly plan is saved', exact: true }).waitFor()
      await page.screenshot({ path: resolve(output, `${width}-${scenario}.png`) })
      assert.ok(await guide.evaluate(element => {
        const box = element.getBoundingClientRect()
        return box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth
      }), 'Coach clipped')
      assert.equal(await guide.locator('details').getAttribute('open'), null)
      const monthSelect = page.locator('.budget-period-panel select').nth(0)
      const scopeSelect = page.locator('.budget-period-panel select').nth(1)
      const selectedMonth = await monthSelect.inputValue()
      const selectedScope = await scopeSelect.inputValue()
      const completion = page.waitForResponse(response => response.request().method() === 'PUT' &&
        response.url().endsWith(`/api/tutorial-progress/${key}`) && response.request().postDataJSON().status === 'Completed')
      if (scenario === 'new') {
        await click('Continue budgeting')
        await completion
        await page.waitForFunction(() => !document.querySelector('.tutorial-layer'))
        assert.equal(new URL(page.url()).pathname, '/budgeting')
        assert.equal(await monthSelect.inputValue(), selectedMonth)
        assert.equal(await scopeSelect.inputValue(), selectedScope)
        assert.equal(await page.getByRole('spinbutton', { name: 'Fuel budget', exact: true }).inputValue(), '12.5')
        await checkBottomHelp('continue')
        await page.screenshot({ path: resolve(output, `${width}-continue-budgeting.png`) })
        const tutorialsLink = page.getByRole('link', { name: 'Tutorials', exact: true }).first()
        if (width < 768) await page.getByRole('button', { name: 'Menu', exact: true }).click()
        const expandHelp = page.getByRole('button', { name: 'Expand Help navigation', exact: true })
        if (await expandHelp.isVisible()) await expandHelp.click()
        await tutorialsLink.click()
      } else await click('Return to tutorials')
      await page.waitForURL('**/tutorials')
      await completion
      assert.equal(checkpoint.status, 'Completed')
      await card.getByRole('button', { name: 'Replay tutorial', exact: true }).click()
      await guide.getByRole('heading', { name: 'Choose your month', exact: true }).waitFor()
      await page.keyboard.press('Escape')
    }
    await page.waitForFunction(() => !document.querySelector('.tutorial-layer'))
    await checkBottomHelp('exit')
    const overflow = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      elements: [...document.querySelectorAll('main *')].flatMap(element => {
        const box = element.getBoundingClientRect()
        return box.right > innerWidth + 1 ? [{ tag: element.tagName, class: element.className, left: box.left, right: box.right }] : []
      }).slice(0, 8) }))
    if (overflow.scrollWidth > overflow.width) await page.screenshot({ path: resolve(output, `${width}-${scenario}-overflow.png`) })
    assert.ok(overflow.scrollWidth <= overflow.width, `Page overflow: ${JSON.stringify(overflow)}`)
    assert.equal(await page.locator('[data-tutorial-inert]').count(), 0)
    assert.equal(creates, absent ? 1 : 0)
    assert.equal(saves, absent || scenario === 'lost-save' ? 1 : 0)
    assert.equal(activates, ['new', 'lost-activate'].includes(scenario) ? 1 : 0)
    results.push({ width, scenario, creates, saves, activates }); console.log(`${width}px: ${scenario}`)
    await context.close()
  }
  assert.deepEqual(errors, [])
  await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2))
  console.log(`${results.length} synthetic budget tutorial cases passed; no database or email used`)
} finally { await browser?.close(); await server.close() }
