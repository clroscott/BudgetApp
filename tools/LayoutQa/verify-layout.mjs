import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { importId, responseFor, user } from './fixtures.mjs'

// Requires an already-installed Playwright + browser, not a package download.
// Run from the repository root. Output is ignored, synthetic-only QA evidence.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const client = resolve(root, 'BudgetApp/budgetapp.client')
const clientRequire = createRequire(resolve(client, 'package.json'))
const { createServer } = await import(pathToFileURL(clientRequire.resolve('vite')).href)
const react = (await import(pathToFileURL(clientRequire.resolve('@vitejs/plugin-react')).href)).default
const sharp = clientRequire('sharp')
const playwrightPath = process.env.BUDGETAPP_QA_PLAYWRIGHT_PATH
const { chromium } = playwrightPath ? await import(pathToFileURL(playwrightPath).href) : await import('playwright')
const mode = process.argv[2] ?? 'after'
assert.ok(['before', 'after', 'interactions', 'compare'].includes(mode), 'Use before, after, interactions or compare')
const slice = process.argv[3] ?? ''
assert.ok(/^[a-z0-9-]*$/.test(slice), 'Use a lowercase slice name')
const evidence = resolve(root, 'artifacts/layout-qa', slice)
const output = resolve(evidence, mode === 'compare' ? 'after' : mode)
await mkdir(output, { recursive: true })
const before = ['after', 'compare'].includes(mode) ? JSON.parse(await readFile(resolve(evidence, 'before/measurements.json'), 'utf8')) : []
const server = mode === 'compare' ? null : await createServer({ root: client, configFile: false, plugins: [react()], server: { host: '127.0.0.1', port: 4178, strictPort: true } })
let browser
const errors = []
const results = mode === 'compare' ? JSON.parse(await readFile(resolve(output, 'measurements.json'), 'utf8')) : []
const layouts = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'collapsed', width: 1440, height: 1000, collapsed: true },
  { name: 'breakpoint', width: 880, height: 900 },
  { name: 'narrow', width: 390, height: 844 },
  // CSS viewport of a 1920px window at 200% zoom. Actual browser zoom and
  // screen-reader announcements must also be checked manually.
  { name: 'zoom-equivalent', width: 960, height: 540, scale: 2 },
]
const allRoutes = [
  { name: 'transactions', path: '/transactions', heading: 'Transactions', ready: '.transaction-row' },
  { name: 'upload', path: '/import', heading: 'Import transactions', ready: '.import-form select option[value="layout-account"]', attached: true },
  { name: 'review', path: `/imports/review?importId=${importId}`, heading: 'Review imported rows', ready: '.import-draft-card' },
  { name: 'rules', path: '/settings/categorization-rules', heading: 'Categorization rules', ready: '.rule-row' },
  { name: 'profiles', path: '/settings/import-profiles', heading: 'Import profiles', ready: '.account-card' },
  { name: 'budget', path: '/budgeting?year=2026&month=10', heading: 'Monthly budget', ready: '.budget-save-bar', flowChange: true },
  { name: 'annual-targets', path: '/budgeting/annual-targets', heading: 'Annual targets', ready: '.yearly-target-row', flowChange: true },
  { name: 'annual-overview', path: '/budgeting/annual-overview?year=2026', heading: 'Annual overview', ready: '.annual-category-row' },
  { name: 'recurring', path: '/budgeting/recurring-expenses', heading: 'Recurring expenses', ready: '.recurring-card', flowChange: true },
  { name: 'categories', path: '/settings/categories', heading: 'Categories', ready: '.category-row', flowChange: true },
  { name: 'budget-empty', path: '/budgeting?year=2026&month=10', heading: 'Monthly budget', emptyBudget: true, ready: '.budget-empty-state', flowChange: true },
  { name: 'budget-failed', path: '/budgeting?year=2026&month=10', heading: 'Monthly budget', failure: /\/budgets\/2026\/10$/, ready: '.page-load-feedback', flowChange: true },
  { name: 'annual-targets-viewer', path: '/budgeting/annual-targets', heading: 'Annual targets', viewer: true, ready: '.yearly-target-row', flowChange: true },
  { name: 'annual-overview-delayed', path: '/budgeting/annual-overview?year=2026', heading: 'Annual overview', delay: 200, ready: '.annual-category-row' },
  { name: 'budget-multiple-households', path: '/budgeting?year=2026&month=10', heading: 'Monthly budget', multipleHouseholds: true, ready: '.budget-save-bar', flowChange: true },
  { name: 'account-no-household', path: '/settings/account', heading: 'Account settings', noHousehold: true, ready: '.account-settings-details' },
]
const remainingRoutes = [
  { name: 'dashboard', path: '/dashboard', heading: 'Hello, Layout QA user', ready: '.dashboard-metrics', flowChange: true },
  { name: 'accounts', path: '/accounts', heading: 'Financial accounts', ready: '.account-card' },
  { name: 'activity', path: '/activity', heading: 'Change history', ready: '.activity-card' },
  { name: 'household', path: '/household', heading: 'Sample household', ready: '.household-member-row' },
  { name: 'household-settings', path: '/household/settings', heading: 'Household settings', ready: '.household-settings-form' },
  { name: 'household-create', path: '/households/new', heading: 'Create another household', ready: '.household-create-form' },
  { name: 'account-settings', path: '/settings/account', heading: 'Account settings', ready: '.account-settings-details' },
  { name: 'tutorials', path: '/tutorials', heading: 'Tutorials', ready: '.tutorial-card' },
  { name: 'help', path: '/help', heading: 'Help', ready: '.help-topic-list' },
  { name: 'help-topic', path: '/help#scope-privacy', heading: 'Scope and privacy', ready: '.help-article' },
  { name: 'help-public', path: '/help#scope-privacy', heading: 'Scope and privacy', ready: '.help-article', anonymous: true, noHousehold: true, headerChange: true },
  { name: 'help-no-household', path: '/help', heading: 'Help', ready: '.help-topic-list', noHousehold: true, headerChange: true },
  { name: 'admin-users', path: '/admin/users', heading: 'Application users', ready: '.admin-users-list li', administrator: true, mfa: true },
  { name: 'admin-support', path: '/admin?account=layout-support-account', heading: 'Application administration', ready: '.admin-account-status', administrator: true, mfa: true },
  { name: 'admin-access', path: '/admin/administrators?account=layout-support-account', heading: 'Application administrators', ready: 'form[aria-label="Administrator access change"]', owner: true, mfa: true },
  { name: 'admin-denied', path: '/admin/users', heading: 'Application users', ready: 'main [role="alert"]', denied: true },
  { name: 'admin-mfa-required', path: '/admin', heading: 'Application administration', ready: 'main a[href="/settings/account"]', administrator: true, denied: true },
  { name: 'household-settings-viewer', path: '/household/settings', heading: 'Household settings', ready: '.household-settings-form', viewer: true },
  { name: 'household-settings-failed', path: '/household/settings', heading: 'Household settings', ready: '.page-load-feedback', failure: /\/households\/[^/]+\/settings$/ },
  { name: 'dashboard-failed', path: '/dashboard', heading: 'Hello, Layout QA user', ready: '.page-load-feedback', failure: /\/dashboard-summary$/, flowChange: true },
]
const routes = mode === 'interactions' ? allRoutes.filter(route => ['budget', 'annual-targets'].includes(route.name))
  : slice === 'remaining' ? [...allRoutes.filter(route => ['transactions', 'budget', 'annual-targets', 'account-no-household'].includes(route.name)), ...remainingRoutes] : allRoutes
try {
  if (mode !== 'compare') {
  await server.listen()
  browser = await chromium.launch({ headless: true, ...(process.env.BUDGETAPP_QA_BROWSER_PATH ? { executablePath: process.env.BUDGETAPP_QA_BROWSER_PATH } : {}) })
  for (const layout of layouts) {
    for (const route of routes) {
      const context = await browser.newContext({ viewport: { width: layout.width, height: layout.height }, deviceScaleFactor: layout.scale ?? 1, reducedMotion: 'reduce' })
      await context.addInitScript(({ id, collapsed }) => {
        localStorage.setItem(`budgetapp.sidebar-collapsed.${id}`, String(collapsed))
      }, { id: user.id, collapsed: Boolean(layout.collapsed) })
      const page = await context.newPage()
      const adminReads = []
      page.on('pageerror', error => errors.push(`${layout.name}/${route.name}: ${error.message}`))
      await page.route('**/*', async intercepted => {
        const request = intercepted.request()
        const url = new URL(request.url())
        if (url.origin !== 'http://127.0.0.1:4178') {
          errors.push(`Blocked external QA request: ${url.origin}`)
          return intercepted.abort()
        }
        if (!url.pathname.startsWith('/api/')) return intercepted.continue()
        if (url.pathname.startsWith('/api/admin/')) adminReads.push(url.pathname)
        if (request.method() !== 'GET') {
          errors.push(`Blocked QA mutation: ${request.method()} ${url.pathname}`)
          return intercepted.abort()
        }
        try {
          if (route.failure?.test(url.pathname)) return intercepted.fulfill({ status: 503, json: { message: 'Synthetic unavailable data for layout QA' } })
          if (route.delay) await new Promise(resolve => setTimeout(resolve, route.delay))
          return intercepted.fulfill({ json: responseFor(url.pathname, route) })
        } catch (error) {
          errors.push(error.message)
          return intercepted.fulfill({ status: 500, json: { message: error.message } })
        }
      })
      await page.goto(`http://127.0.0.1:4178${route.path}`)
      await page.getByRole('heading', { name: route.heading, exact: true }).waitFor()
      await page.locator(route.ready).first().waitFor({ state: route.attached ? 'attached' : 'visible' })
      if (route.viewer) {
        if (route.name.startsWith('household-settings')) assert.ok(await page.getByRole('textbox', { name: 'Household name', exact: true }).isDisabled())
        else assert.ok(await page.getByRole('button', { name: 'Save annual targets', exact: true }).isDisabled())
      }
      if (route.denied) assert.deepEqual(adminReads, [], `${route.name}: unauthorized page must not read admin data`)
      if (route.failure) {
        assert.ok(await page.getByRole('button', { name: 'Retry loading', exact: true }).isVisible())
        assert.equal(await page.locator('.budget-empty-state, .budget-save-bar').count(), 0)
      }
      if (route.multipleHouseholds) assert.equal(await page.locator('.household-context-bar select option').count(), 2)
      await page.evaluate(() => document.fonts.ready)
      await page.screenshot({ path: resolve(output, `${layout.name}-${route.name}.png`), fullPage: true })
      const measurements = await page.evaluate(() => {
        const rect = element => {
          if (!element) return null
          const { x, y, width, height } = element.getBoundingClientRect()
          return { x, y, width, height }
        }
        const content = document.querySelector('.page-frame-content, .management-content, .dashboard-content')
        return {
          content: rect(content), heading: rect(document.querySelector('main h1')),
          nav: rect(document.querySelector('main .budgeting-section-nav')),
          scrollWidth: document.documentElement.scrollWidth, viewport: window.innerWidth,
          form: rect(document.querySelector('.import-form')), hiddenHeaders: document.querySelectorAll('main > .app-header').length,
        }
      })
      const key = `${layout.name}-${route.name}`
      results.push({ key, ...measurements })
      if (mode === 'after') {
        assert.ok(measurements.scrollWidth <= measurements.viewport, `${key}: document must not overflow sideways`)
        assert.equal(measurements.hiddenHeaders, 0, `${key}: no retired page header`)
      }
      const profile = page.locator('.profile-menu')
      if (!route.anonymous) {
      await profile.locator('summary').click()
      assert.ok(await profile.getByRole('link', { name: 'Account settings', exact: true }).isVisible())
      await profile.getByRole('link', { name: 'Account settings', exact: true }).focus()
      await page.keyboard.press('Escape')
      assert.equal(await profile.getAttribute('open'), null)
      assert.ok(await profile.locator('summary').evaluate(element => element === document.activeElement))
      } else assert.ok(await page.getByRole('link', { name: 'Return to sign in', exact: true }).isVisible())
      if (layout.width <= 880 && !route.noHousehold) {
        await page.getByRole('button', { name: 'Menu', exact: true }).click()
        await page.getByRole('link', { name: 'Skip to main content' }).focus()
        await page.keyboard.press('Enter')
        assert.equal(await page.getByRole('button', { name: 'Menu', exact: true }).getAttribute('aria-expanded'), 'false')
        assert.ok(await page.getByRole('heading', { name: route.heading, exact: true }).evaluate(element => element === document.activeElement))
      }
      if (['review', 'budget', 'annual-targets', 'annual-targets-viewer'].includes(route.name)) {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
        await page.getByRole('button', { name: 'Back to top' }).waitFor()
        if (route.name.startsWith('annual-targets')) {
          const actions = page.getByRole('region', { name: 'Annual target actions' })
          const back = actions.getByRole('button', { name: 'Back to top' })
          await back.waitFor()
          const save = actions.getByRole('button', { name: 'Save annual targets', exact: true })
          const bounds = await Promise.all([actions.boundingBox(), back.boundingBox(), save.boundingBox()])
          const [bar, top, submit] = bounds
          for (const button of [top, submit]) {
            assert.ok(button.x >= bar.x && button.x + button.width <= bar.x + bar.width + 1, `${key}: annual action outside bar`)
            assert.ok(button.y >= bar.y && button.y + button.height <= bar.y + bar.height + 1, `${key}: annual action clipped`)
          }
          const overlaps = top.x < submit.x + submit.width && top.x + top.width > submit.x && top.y < submit.y + submit.height && top.y + top.height > submit.y
          assert.equal(overlaps, false, `${key}: annual actions overlap`)
          assert.equal(await back.evaluate(element => getComputedStyle(element).position), 'static')
          await back.click()
          await page.waitForFunction(() => window.scrollY === 0)
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
          await back.waitFor()
          // A wrapped action row can grow after Back to top is portaled in.
          // Reach the updated document bottom before checking the final controls.
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
        }
        await page.screenshot({ path: resolve(output, `${key}-scrolled.png`) })
        if (mode === 'after' && layout.width <= 880) {
          const overlaps = await page.evaluate(() => {
            const nav = document.querySelector('.app-sidebar').getBoundingClientRect()
            const context = document.querySelector('.app-context-header').getBoundingClientRect()
            return context.top < nav.bottom - 1
          })
          assert.equal(overlaps, false, `${key}: sticky headers overlap`)
        }
        if (route.name === 'budget') {
          assert.ok(await page.getByRole('region', { name: 'Budget actions' }).getByRole('button', { name: 'Back to top' }).isVisible())
          const trigger = page.getByRole('button', { name: /Open calculator for/ }).last()
          await trigger.click()
          await page.getByRole('button', { name: 'Close calculator' }).waitFor()
          await page.keyboard.press('Escape')
          assert.ok(await trigger.evaluate(element => element === document.activeElement))
        }
      }
      if (mode === 'interactions') {
        const triggers = page.getByRole('button', { name: /Open calculator for/ })
        const first = triggers.first(), last = triggers.last()
        // Calculator results only change local fixture-backed form state. No
        // Save/Create/Allocate control is activated; all API writes stay blocked.
        const amountInputs = page.locator(route.name === 'budget' ? '.budget-amount-row input[type="number"]' : '.yearly-target-row input[type="number"]')
        const unchanged = await amountInputs.first().inputValue()
        await first.click()
        await page.getByLabel('Calculation', { exact: true }).fill('24 / 2')
        await page.keyboard.press('Enter')
        assert.equal(await page.getByRole('status').filter({ hasText: 'Result:' }).textContent(), 'Result: 12')
        await last.click()
        assert.equal(await page.getByRole('dialog').count(), 1)
        assert.equal(await first.getAttribute('aria-expanded'), 'false')
        assert.equal(await amountInputs.first().inputValue(), unchanged)
        await page.getByRole('heading', { name: route.heading, exact: true }).click()
        assert.equal(await page.getByRole('dialog').count(), 0)
        await last.click()
        await page.getByRole('button', { name: 'Close calculator', exact: true }).click({ timeout: 5000 })
        assert.ok(await last.evaluate(element => element === document.activeElement))
        await last.click()
        await page.getByLabel('Calculation', { exact: true }).fill('24 / 2')
        await page.keyboard.press('Enter')
        await page.getByRole('button', { name: 'Use result', exact: true }).click({ timeout: 5000 })
        assert.equal(await amountInputs.last().inputValue(), '12')
        assert.equal(await page.getByRole('dialog').count(), 0)
        assert.ok(await last.evaluate(element => element === document.activeElement))
      }
      await context.close()
    }
  }
  }
  assert.deepEqual(errors, [], 'No unexpected requests or page errors')
  await writeFile(resolve(output, 'measurements.json'), JSON.stringify(results, null, 2))
  if (mode === 'after' || mode === 'compare') {
    for (const result of results) {
      const old = before.find(item => item.key === result.key)
      assert.ok(old, `${result.key}: missing baseline`)
      const route = routes.find(route => layouts.some(layout => result.key === `${layout.name}-${route.name}`))
      assert.ok(route, `${result.key}: unknown route/layout`)
      for (const field of ['content', 'heading', 'nav', 'form']) {
        if (route.headerChange) {
          if (field === 'content') for (const axis of ['x', 'width']) assert.equal(result[field][axis], old[field][axis], `${result.key}: content ${axis} changed`)
          continue
        }
        if (field === 'content' && route.flowChange) {
          for (const axis of ['x', 'y', 'width']) assert.equal(result[field][axis], old[field][axis], `${result.key}: content ${axis} changed`)
        } else assert.deepEqual(result[field], old[field], `${result.key}: ${field} geometry changed`)
      }
    }
    const pixels = []
    for (const result of results) {
      const old = await sharp(resolve(evidence, 'before', `${result.key}.png`)).raw().toBuffer({ resolveWithObject: true })
      const current = await sharp(resolve(output, `${result.key}.png`)).raw().toBuffer({ resolveWithObject: true })
      if (JSON.stringify(current.info) !== JSON.stringify(old.info)) {
        pixels.push({ key: result.key, dimensionsChanged: true, before: old.info, after: current.info })
        continue
      }
      let changedChannels = 0
      for (let index = 0; index < current.data.length; index++) if (current.data[index] !== old.data[index]) changedChannels++
      pixels.push({ key: result.key, changedChannels, totalChannels: current.data.length })
    }
    // Pixel differences are review evidence, not a portable timing/anti-aliasing
    // test gate. The exact geometry comparisons above are deterministic here.
    await writeFile(resolve(output, 'pixel-comparisons.json'), JSON.stringify(pixels, null, 2))
    console.log(`Initial rendered images identical: ${pixels.filter(item => item.changedChannels === 0).length}/${pixels.length}`)
  }
  console.log(`${mode}: ${results.length} rendered page/layout cases passed; screenshots and measurements in ${output}`)
} finally {
  await browser?.close()
  await server?.close()
}
