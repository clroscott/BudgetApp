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
assert.ok(['before', 'after'].includes(mode), 'Use before or after')
const output = resolve(root, 'artifacts/layout-qa', mode)
await mkdir(output, { recursive: true })
const server = await createServer({ root: client, configFile: false, plugins: [react()], server: { host: '127.0.0.1', port: 4178, strictPort: true } })
let browser
const errors = []
const results = []
const before = mode === 'after' ? JSON.parse(await readFile(resolve(root, 'artifacts/layout-qa/before/measurements.json'), 'utf8')) : []
const layouts = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'collapsed', width: 1440, height: 1000, collapsed: true },
  { name: 'breakpoint', width: 880, height: 900 },
  { name: 'narrow', width: 390, height: 844 },
  // CSS viewport of a 1920px window at 200% zoom. Actual browser zoom and
  // screen-reader announcements must also be checked manually.
  { name: 'zoom-equivalent', width: 960, height: 540, scale: 2 },
]
const routes = [
  { name: 'transactions', path: '/transactions', heading: 'Transactions' },
  { name: 'upload', path: '/import', heading: 'Import transactions' },
  { name: 'review', path: `/imports/review?importId=${importId}`, heading: 'Review imported rows' },
  { name: 'rules', path: '/settings/categorization-rules', heading: 'Categorization rules' },
  { name: 'profiles', path: '/settings/import-profiles', heading: 'Import profiles' },
  { name: 'budget', path: '/budgeting?year=2026&month=10', heading: 'Monthly budget' },
  { name: 'account-no-household', path: '/settings/account', heading: 'Account settings', noHousehold: true },
]
try {
  await server.listen()
  browser = await chromium.launch({ headless: true, ...(process.env.BUDGETAPP_QA_BROWSER_PATH ? { executablePath: process.env.BUDGETAPP_QA_BROWSER_PATH } : {}) })
  for (const layout of layouts) {
    for (const route of routes) {
      const context = await browser.newContext({ viewport: { width: layout.width, height: layout.height }, deviceScaleFactor: layout.scale ?? 1, reducedMotion: 'reduce' })
      await context.addInitScript(({ id, collapsed }) => {
        localStorage.setItem(`budgetapp.sidebar-collapsed.${id}`, String(collapsed))
      }, { id: user.id, collapsed: Boolean(layout.collapsed) })
      const page = await context.newPage()
      page.on('pageerror', error => errors.push(`${layout.name}/${route.name}: ${error.message}`))
      await page.route('**/*', async intercepted => {
        const request = intercepted.request()
        const url = new URL(request.url())
        if (url.origin !== 'http://127.0.0.1:4178') {
          errors.push(`Blocked external QA request: ${url.origin}`)
          return intercepted.abort()
        }
        if (!url.pathname.startsWith('/api/')) return intercepted.continue()
        if (request.method() !== 'GET') {
          errors.push(`Blocked QA mutation: ${request.method()} ${url.pathname}`)
          return intercepted.abort()
        }
        try {
          return intercepted.fulfill({ json: responseFor(url.pathname, route) })
        } catch (error) {
          errors.push(error.message)
          return intercepted.fulfill({ status: 500, json: { message: error.message } })
        }
      })
      await page.goto(`http://127.0.0.1:4178${route.path}`)
      await page.getByRole('heading', { name: route.heading, exact: true }).waitFor()
      if (route.name === 'review') await page.locator('.import-draft-card').first().waitFor()
      if (route.name === 'budget') await page.getByRole('region', { name: 'Budget actions' }).waitFor()
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
        // The unmigrated budget period controls already overflow at this short
        // desktop/zoom viewport. Record that follow-up, but never worsen it.
        const previousWidth = before.find(item => item.key === key)?.scrollWidth ?? measurements.viewport
        const allowedWidth = route.name === 'budget' ? Math.max(measurements.viewport, previousWidth) : measurements.viewport
        assert.ok(measurements.scrollWidth <= allowedWidth, `${key}: document must not gain sideways overflow`)
        if (!['budget', 'account-no-household'].includes(route.name)) assert.equal(measurements.hiddenHeaders, 0, `${key}: no retired page header`)
      }
      const profile = page.locator('.profile-menu')
      await profile.locator('summary').click()
      assert.ok(await profile.getByRole('link', { name: 'Account settings', exact: true }).isVisible())
      await profile.getByRole('link', { name: 'Account settings', exact: true }).focus()
      await page.keyboard.press('Escape')
      assert.equal(await profile.getAttribute('open'), null)
      assert.ok(await profile.locator('summary').evaluate(element => element === document.activeElement))
      if (layout.width <= 880 && !route.noHousehold) {
        await page.getByRole('button', { name: 'Menu', exact: true }).click()
        await page.getByRole('link', { name: 'Skip to main content' }).focus()
        await page.keyboard.press('Enter')
        assert.equal(await page.getByRole('button', { name: 'Menu', exact: true }).getAttribute('aria-expanded'), 'false')
        assert.ok(await page.getByRole('heading', { name: route.heading, exact: true }).evaluate(element => element === document.activeElement))
      }
      if (route.name === 'review' || route.name === 'budget') {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
        await page.getByRole('button', { name: 'Back to top' }).waitFor()
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
      await context.close()
    }
  }
  assert.deepEqual(errors, [], 'No unexpected requests or page errors')
  await writeFile(resolve(output, 'measurements.json'), JSON.stringify(results, null, 2))
  if (mode === 'after') {
    for (const result of results) {
      const old = before.find(item => item.key === result.key)
      for (const field of ['content', 'heading', 'nav', 'form']) {
        assert.deepEqual(result[field], old[field], `${result.key}: ${field} geometry changed`)
      }
    }
    const pixels = []
    for (const result of results) {
      const old = await sharp(resolve(root, 'artifacts/layout-qa/before', `${result.key}.png`)).raw().toBuffer({ resolveWithObject: true })
      const current = await sharp(resolve(output, `${result.key}.png`)).raw().toBuffer({ resolveWithObject: true })
      assert.deepEqual(current.info, old.info, `${result.key}: rendered image dimensions changed`)
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
  await server.close()
}
