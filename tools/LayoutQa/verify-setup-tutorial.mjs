// Intercepted synthetic fixture commands only; no real data, server or email.
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
const output = resolve(root, 'artifacts/setup-tutorial-qa'); await mkdir(output, { recursive: true })
const server = await createServer({ root: client, configFile: false, plugins: [react()], server: { host: '127.0.0.1', port: 4199, strictPort: true } })
const results = [], errors = []; let browser
try {
  await server.listen(); browser = await chromium.launch({ headless: true, ...(process.env.BUDGETAPP_QA_BROWSER_PATH ? { executablePath: process.env.BUDGETAPP_QA_BROWSER_PATH } : {}) })
  for (const width of [1440, 390, 320]) for (const scenario of ['existing', 'new-both', 'viewer', 'lost-account', 'lost-category', 'failed-read']) {
    const context = await browser.newContext({ viewport: { width, height: width === 320 ? 740 : 900 }, reducedMotion: 'reduce' })
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept())
    let accounts = responseFor('/api/households/layout-household/accounts'), categories = responseFor('/api/households/layout-household/categories')
    let accountAdds = 0, categoryAdds = 0, failRead = scenario === 'failed-read', checkpoint = null
    if (['new-both', 'viewer', 'lost-account'].includes(scenario)) accounts = []
    if (['new-both', 'viewer', 'lost-category'].includes(scenario)) categories = []
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method()
      if (url.origin !== 'http://127.0.0.1:4199') { errors.push('External request blocked'); return route.abort() }
      if (!path.startsWith('/api/')) return route.continue()
      if (method === 'GET' && path === '/api/auth/antiforgery') return route.fulfill({ json: { token: 'synthetic' } })
      if (method === 'PUT' && path === '/api/tutorial-progress/set-up-finances') {
        const body = request.postDataJSON(); assert.deepEqual(Object.keys(body).sort(), ['currentStepIndex', 'status', 'tutorialVersion'])
        checkpoint = { ...body, tutorialKey: 'set-up-finances', startedAtUtc: '', updatedAtUtc: '', completedAtUtc: null, dismissedAtUtc: null }
        return route.fulfill({ json: checkpoint })
      }
      if (method === 'POST' && path.endsWith('/accounts')) {
        assert.ok(['new-both', 'viewer', 'lost-account'].includes(scenario)); assert.equal(++accountAdds, 1)
        const saved = { ...responseFor('/api/households/layout-household/accounts')[0], ...request.postDataJSON(), id: 'qa-account' }; accounts.push(saved)
        assert.equal(saved.scope, 'Personal')
        if (scenario === 'lost-account') return route.abort()
        return route.fulfill({ json: { id: saved.id } })
      }
      if (method === 'POST' && path.endsWith('/categories')) {
        assert.ok(['new-both', 'lost-category'].includes(scenario)); categoryAdds++; assert.ok(categoryAdds <= 2)
        const input = request.postDataJSON(), saved = { id: input.parentCategoryId ? 'qa-child' : 'qa-category', name: input.name, type: 'Expense', isActive: true, displayOrder: 0, children: [] }
        if (input.parentCategoryId) categories = categories.map(root => root.id === input.parentCategoryId ? { ...root, children: [...root.children, saved] } : root)
        else categories.push(saved)
        if (scenario === 'lost-category') return route.abort()
        return route.fulfill({ json: { id: saved.id } })
      }
      if (method !== 'GET') { errors.push(`Unexpected write ${method} ${path}`); return route.abort() }
      if (path === '/api/tutorial-progress') return route.fulfill({ json: checkpoint ? [checkpoint] : [] })
      if (path.endsWith('/accounts')) return failRead ? route.fulfill({ status: 503, json: { detail: 'Synthetic account read failure' } }) : route.fulfill({ json: accounts })
      if (path.endsWith('/categories')) return route.fulfill({ json: categories })
      try { return route.fulfill({ json: responseFor(path, { viewer: scenario === 'viewer' }) }) }
      catch (error) { errors.push(error.message); return route.abort() }
    })
    // A normal user can scroll long forms above the fixed coach. Preserve native
    // hit testing; never force clicks through the coach or a sticky page header.
    const clickPage = async locator => {
      await locator.scrollIntoViewIfNeeded()
      await locator.evaluate(element => {
        const header = document.querySelector('.app-context-header')?.getBoundingClientRect().bottom ?? 128
        const coach = document.querySelector('.tutorial-coach-card')?.getBoundingClientRect().top ?? innerHeight
        const box = element.getBoundingClientRect()
        if (box.top < header + 8 || box.bottom > coach - 8) window.scrollBy(0, box.top - header - 16)
      })
      await locator.click()
    }
    await page.goto('http://127.0.0.1:4199/tutorials')
    await page.locator('.tutorial-card').filter({ has: page.getByRole('heading', { name: 'Set up your finances', exact: true }) }).getByRole('button', { name: 'Start tutorial', exact: true }).click()
    const guide = page.getByRole('region', { name: 'Set up your finances tutorial controls' })
    const next = () => guide.getByRole('button', { name: 'Next', exact: true }).click()
    if (failRead) { await guide.getByText('Needs attention').waitFor(); failRead = false; await page.getByRole('button', { name: 'Retry loading', exact: true }).click() }
    await guide.getByRole('button', { name: scenario === 'lost-category' ? 'Categories' : scenario === 'lost-account' ? 'Accounts' : 'Both', exact: true }).click()
    if (scenario !== 'lost-category') {
      await page.getByLabel('Account for this tutorial').selectOption(accounts.length ? accounts[0].id : 'new')
      await guide.getByRole('button', { name: 'Use this account', exact: true }).click(); await next()
      if (!accounts.length) {
        const form = page.locator('#setup-account-create')
        await form.getByLabel('Account name', { exact: true }).fill('QA ONLY personal account')
        await form.getByLabel('Scope', { exact: false }).selectOption('Personal')
        assert.equal(accountAdds, 0); await clickPage(form.getByRole('button', { name: 'Add account', exact: true }))
        if (scenario === 'lost-account') {
          await page.getByRole('button', { name: 'Check saved accounts', exact: true }).waitFor()
          assert.ok(await page.getByLabel('Account for this tutorial').isDisabled())
          await page.getByRole('button', { name: 'Check saved accounts', exact: true }).click()
          await guide.getByRole('button', { name: 'Back', exact: true }).click(); await guide.getByRole('button', { name: 'Back', exact: true }).click()
          await page.getByLabel('Account for this tutorial').selectOption('qa-account')
          await guide.getByRole('button', { name: 'Use this account', exact: true }).click(); await next()
        }
      }
      await next()
    }
    if (scenario !== 'lost-account') {
      await next()
      if (scenario === 'new-both' || scenario === 'lost-category') {
        await page.getByLabel('New root category', { exact: true }).fill('QA ONLY food')
        assert.equal(categoryAdds, 0); await clickPage(page.getByRole('button', { name: 'Add category', exact: true }))
        if (scenario === 'lost-category') {
          await page.getByRole('button', { name: 'Check saved categories', exact: true }).waitFor()
          assert.ok(await page.getByRole('button', { name: 'Use the checked saved list', exact: true }).isDisabled())
          await page.getByRole('button', { name: 'Check saved categories', exact: true }).click()
          await clickPage(page.getByRole('button', { name: 'Use the checked saved list', exact: true }))
        } else {
          await clickPage(page.getByRole('button', { name: 'Add subcategory', exact: true }))
          await page.getByLabel('New subcategory under QA ONLY food', { exact: true }).fill('QA ONLY groceries')
          await clickPage(page.getByRole('button', { name: 'Add', exact: true }))
        }
      }
      if (scenario === 'viewer') { assert.equal(await page.getByRole('button', { name: 'Add category', exact: true }).count(), 0); await page.getByRole('heading', { name: 'No categories to show', exact: true }).waitFor() }
      await next()
    }
    await page.screenshot({ path: resolve(output, `${width}-${scenario}-complete.png`) })
    assert.ok(await guide.evaluate(element => { const box = element.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight && box.right <= innerWidth }))
    const done = page.waitForResponse(response => response.request().method() === 'PUT' && response.request().postDataJSON()?.status === 'Completed')
    await guide.getByRole('button', { name: scenario === 'lost-account' ? 'Continue with accounts' : 'Continue with categories', exact: true }).click(); await done
    assert.equal(checkpoint.status, 'Completed'); assert.equal(accountAdds, ['new-both', 'viewer', 'lost-account'].includes(scenario) ? 1 : 0)
    assert.equal(categoryAdds, scenario === 'new-both' ? 2 : scenario === 'lost-category' ? 1 : 0)
    assert.equal(await page.locator('[data-tutorial-inert]').count(), 0); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    results.push({ width, scenario }); console.log(`${width}px: ${scenario}`); await context.close()
  }
  assert.deepEqual(errors, []); await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2))
  console.log(`${results.length} setup tutorial cases passed; only explicit synthetic configuration saves, no real data/email`)
} finally { await browser?.close(); await server.close() }
