// All data is disposable and every API is intercepted. No DB/email/server writes.
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
const output = resolve(root, 'artifacts/profile-tutorial-qa'); await mkdir(output, { recursive: true })
const server = await createServer({ root: client, configFile: false, plugins: [react()], server: { host: '127.0.0.1', port: 4198, strictPort: true } })
const results = [], errors = []; let browser
try {
  await server.listen(); browser = await chromium.launch({ headless: true, ...(process.env.BUDGETAPP_QA_BROWSER_PATH ? { executablePath: process.env.BUDGETAPP_QA_BROWSER_PATH } : {}) })
  const widths = process.argv[2] ? [Number(process.argv[2])] : [1440, 390, 320]
  const scenarios = process.argv[3] ? [process.argv[3]] : ['existing', 'new', 'viewer', 'lost-reply']
  assert.ok(widths.every(width => [1440, 390, 320].includes(width)))
  assert.ok(scenarios.every(scenario => ['existing', 'new', 'viewer', 'lost-reply'].includes(scenario)))
  for (const width of widths) for (const scenario of scenarios) {
    const context = await browser.newContext({ viewport: { width, height: width === 320 ? 740 : 900 }, reducedMotion: 'reduce' })
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept())
    let profiles = responseFor('/api/households/layout-household/import-profiles'), checkpoint = null, saves = 0, templates = 0
    let failRead = scenario === 'lost-reply'
    if (scenario === 'viewer') profiles = profiles.map(profile => ({ ...profile, defaultAccountId: 'hidden-personal-account' }))
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method()
      if (url.origin !== 'http://127.0.0.1:4198') { errors.push('External request blocked'); return route.abort() }
      if (!path.startsWith('/api/')) return route.continue()
      if (method === 'GET' && path === '/api/auth/antiforgery') return route.fulfill({ json: { token: 'synthetic' } })
      if (method === 'PUT' && path === '/api/tutorial-progress/manage-import-profiles') {
        const body = request.postDataJSON(); assert.deepEqual(Object.keys(body).sort(), ['currentStepIndex', 'status', 'tutorialVersion'])
        checkpoint = { ...body, tutorialKey: 'manage-import-profiles', startedAtUtc: '', updatedAtUtc: '', completedAtUtc: null, dismissedAtUtc: null }
        return route.fulfill({ json: checkpoint })
      }
      if (method === 'POST' && path.endsWith('/import-profiles')) {
        assert.ok(['new', 'lost-reply'].includes(scenario)); assert.equal(++saves, 1)
        const saved = { ...request.postDataJSON(), id: 'qa-created-profile', isActive: true }; profiles.push(saved)
        if (scenario === 'lost-reply') return route.abort()
        assert.equal(saved.dateFormat, 'dd/MM/yyyy'); assert.equal(saved.numberCulture, 'de-DE')
        return route.fulfill({ json: saved })
      }
      if (method !== 'GET') { errors.push(`Unexpected write ${method} ${path}`); return route.abort() }
      if (path === '/api/tutorial-progress') return route.fulfill({ json: checkpoint ? [checkpoint] : [] })
      if (path.endsWith('/import-profiles')) return failRead ? route.fulfill({ status: 503, json: { detail: 'Synthetic profile read failure' } }) : route.fulfill({ json: profiles })
      if (/\/import-profiles\/[^/]+\/template$/.test(path)) {
        assert.equal(scenario, 'new'); assert.equal(++templates, 1)
        return route.fulfill({ contentType: 'text/csv', headers: { 'Content-Disposition': 'attachment; filename="qa-template.csv"' }, body: 'Date,Description,Amount\r\n' })
      }
      try { return route.fulfill({ json: responseFor(path, { viewer: scenario === 'viewer' }) }) }
      catch (error) { errors.push(error.message); return route.abort() }
    })
    await page.goto('http://127.0.0.1:4198/tutorials')
    await page.locator('.tutorial-card').filter({ has: page.getByRole('heading', { name: 'Reuse CSV and Excel mappings', exact: true }) }).getByRole('button', { name: 'Start tutorial', exact: true }).click()
    const guide = page.getByRole('region', { name: 'Reuse CSV and Excel mappings tutorial controls' })
    const next = () => guide.getByRole('button', { name: 'Next', exact: true }).click()
    if (failRead) { await guide.getByText('Needs attention').waitFor(); failRead = false; await page.getByRole('button', { name: 'Retry loading', exact: true }).click() }
    const existing = scenario === 'existing' || scenario === 'viewer'
    await page.getByLabel('Profile for this tutorial').selectOption(existing ? profiles[0].id : 'new')
    await guide.getByRole('button', { name: 'Use this mapping', exact: true }).click()
    if (!existing) await page.getByLabel('Profile name', { exact: true }).fill('QA ONLY mapping')
    if (scenario === 'viewer') {
      assert.equal(await page.getByLabel('Profile name', { exact: true }).count(), 0)
      await page.getByText('Mapping details', { exact: true }).first().click()
      await page.getByText('Preferred account: Not available to your account', { exact: true }).waitFor()
    }
    await next(); await next()
    if (!existing) {
      await page.getByLabel('Text date format', { exact: false }).selectOption('dd/MM/yyyy')
      await page.getByLabel('Text number format', { exact: false }).selectOption('de-DE')
    }
    await next(); assert.equal(saves, 0)
    if (scenario === 'existing') await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    else if (!existing) await page.getByRole('button', { name: 'Create profile', exact: true }).click()
    if (scenario === 'lost-reply') {
      await page.getByRole('button', { name: 'Check saved profiles', exact: true }).click()
      assert.ok(await page.getByRole('button', { name: 'Create profile', exact: true }).isDisabled())
      await guide.getByText('More details', { exact: true }).click(); await guide.getByRole('button', { name: 'Restart task selection', exact: true }).click()
      await page.getByLabel('Profile for this tutorial').selectOption('qa-created-profile')
      await guide.getByRole('button', { name: 'Use this mapping', exact: true }).click(); await next(); await next(); await next()
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    }
    if (scenario === 'new') {
      await page.locator('[data-tutorial-id="profile-tour-selected"].tutorial-task-target').waitFor()
      await page.screenshot({ path: resolve(output, `${width}-before-template.png`) })
      // Optional controls lower in a tall card may require an ordinary page
      // scroll above the dock. Do not force clicks through the coach.
      if (width === 320) { await page.mouse.move(160, 250); await page.mouse.wheel(0, 120) }
      await Promise.all([page.waitForEvent('download'), page.locator('[data-tutorial-id="profile-tour-selected"]').getByRole('link', { name: 'Download template', exact: true }).click()])
    }
    await next()
    await page.locator('[data-tutorial-id="profile-tour-upload"]').selectOption(existing ? profiles[0].id : 'qa-created-profile')
    await next(); await page.screenshot({ path: resolve(output, `${width}-${scenario}-complete.png`) })
    assert.ok(await guide.evaluate(element => { const box = element.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight && box.right <= innerWidth }))
    const done = page.waitForResponse(response => response.request().method() === 'PUT' && response.request().postDataJSON()?.status === 'Completed')
    await guide.getByRole('button', { name: 'Continue importing', exact: true }).click(); await done
    assert.equal(checkpoint.status, 'Completed'); assert.equal(new URL(page.url()).pathname, '/import')
    assert.equal(saves, existing ? 0 : 1); assert.equal(templates, scenario === 'new' ? 1 : 0)
    assert.equal(await page.locator('[data-tutorial-inert]').count(), 0); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    results.push({ width, scenario }); console.log(`${width}px: ${scenario}`); await context.close()
  }
  assert.deepEqual(errors, []); await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2))
  console.log(`${results.length} profile tutorial cases passed; no upload, inspection, transaction or real data/email`)
} finally { await browser?.close(); await server.close() }
