// Fake recipients and intercepted delivery only. Never connects to SMTP or a DB.
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
const output = resolve(root, 'artifacts/invitation-tutorial-qa'); await mkdir(output, { recursive: true })
const server = await createServer({ root: client, configFile: false, plugins: [react()], server: { host: '127.0.0.1', port: 4200, strictPort: true } })
const results = [], errors = []; let browser
try {
  await server.listen(); browser = await chromium.launch({ headless: true, ...(process.env.BUDGETAPP_QA_BROWSER_PATH ? { executablePath: process.env.BUDGETAPP_QA_BROWSER_PATH } : {}) })
  for (const width of [1440, 390, 320]) for (const scenario of ['pending', 'expired', 'revoked', 'accepted', 'viewer', 'new', 'email-failed', 'lost-reply', 'failed-read']) {
    const context = await browser.newContext({ viewport: { width, height: width === 320 ? 740 : 900 }, reducedMotion: 'reduce' })
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept())
    const existing = { id: '11111111-1111-4111-8111-111111111166', email: 'existing@example.test', role: 'Viewer', status: ['expired', 'revoked', 'accepted'].includes(scenario) ? scenario[0].toUpperCase() + scenario.slice(1) : 'Pending',
      createdAtUtc: '2026-10-16T12:00:00Z', lastSentAtUtc: '2026-10-16T12:00:00Z', expiresAtUtc: '2026-10-23T12:00:00Z' }
    let management = { ...responseFor('/api/households/layout-household/members', { viewer: scenario === 'viewer' }), invitations: scenario === 'viewer' ? [] : [existing] }
    let sends = 0, checkpoint = null, failRead = scenario === 'failed-read'
    const creates = ['new', 'email-failed', 'lost-reply'].includes(scenario)
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method()
      if (url.origin !== 'http://127.0.0.1:4200') { errors.push('External request blocked'); return route.abort() }
      if (!path.startsWith('/api/')) return route.continue()
      if (method === 'GET' && path === '/api/auth/antiforgery') return route.fulfill({ json: { token: 'synthetic' } })
      if (method === 'PUT' && path === '/api/tutorial-progress/invite-household-member') {
        const body = request.postDataJSON(); assert.deepEqual(Object.keys(body).sort(), ['currentStepIndex', 'status', 'tutorialVersion'])
        checkpoint = { ...body, tutorialKey: 'invite-household-member', startedAtUtc: '', updatedAtUtc: '', completedAtUtc: null, dismissedAtUtc: null }
        assert.ok(!JSON.stringify(checkpoint).includes('@'))
        return route.fulfill({ json: checkpoint })
      }
      if (method === 'POST' && path.endsWith('/invitations')) {
        assert.ok(creates); assert.equal(++sends, 1)
        const input = request.postDataJSON(); assert.deepEqual(input, { email: 'qa-only@example.test', role: 'Viewer' })
        const invitation = { ...existing, ...input, id: '22222222-2222-4222-8222-222222222266', status: 'Pending' }; management.invitations.push(invitation)
        if (scenario === 'lost-reply') return route.abort()
        return route.fulfill({ json: { invitation, emailDelivered: scenario !== 'email-failed' } })
      }
      if (method !== 'GET') { errors.push(`Unexpected write/message ${method} ${path}`); return route.abort() }
      if (path === '/api/tutorial-progress') return route.fulfill({ json: checkpoint ? [checkpoint] : [] })
      if (path.endsWith('/members')) return failRead ? route.fulfill({ status: 503, json: { detail: 'Synthetic membership read failure' } }) : route.fulfill({ json: management })
      try { return route.fulfill({ json: responseFor(path, { viewer: scenario === 'viewer' }) }) }
      catch (error) { errors.push(error.message); return route.abort() }
    })
    const clickPage = async locator => {
      await locator.scrollIntoViewIfNeeded()
      await locator.evaluate(element => {
        const header = document.querySelector('.app-context-header')?.getBoundingClientRect().bottom ?? 128
        const coach = document.querySelector('.tutorial-coach-card')?.getBoundingClientRect().top ?? innerHeight
        const box = element.getBoundingClientRect()
        if (box.top < header + 8 || box.bottom > coach - 8) window.scrollBy(0, box.top - header - 16)
      }); await locator.click()
    }
    await page.goto('http://127.0.0.1:4200/tutorials')
    await page.locator('.tutorial-card').filter({ has: page.getByRole('heading', { name: 'Invite a household member', exact: true }) }).getByRole('button', { name: 'Start tutorial', exact: true }).click()
    const guide = page.getByRole('region', { name: 'Invite a household member tutorial controls' })
    const next = () => guide.getByRole('button', { name: 'Next', exact: true }).click()
    if (failRead) { await guide.getByText('Needs attention').waitFor(); failRead = false; await page.getByRole('button', { name: 'Retry loading', exact: true }).click() }
    await page.getByLabel('Invitation or membership to review').selectOption(creates ? 'new' : scenario === 'viewer' ? 'review' : `invitation:${existing.id}`)
    await guide.getByRole('button', { name: 'Use this choice', exact: true }).click()
    if (creates) await page.getByLabel('Role', { exact: false }).selectOption('Viewer')
    await next()
    if (creates) await page.getByLabel('Email', { exact: true }).fill('qa-only@example.test')
    await next(); assert.equal(sends, 0)
    if (creates) {
      assert.ok(await guide.getByRole('button', { name: 'Next', exact: true }).isDisabled())
      await clickPage(page.getByRole('button', { name: 'Send invitation', exact: true }))
      if (scenario === 'lost-reply') {
        await page.getByRole('button', { name: 'Check saved invitations', exact: true }).waitFor()
        assert.ok(await page.getByLabel('Invitation or membership to review').isDisabled())
        await clickPage(page.getByRole('button', { name: 'Check saved invitations', exact: true }))
        await guide.getByText('More details', { exact: true }).click(); await guide.getByRole('button', { name: 'Restart task selection', exact: true }).click()
        await page.getByLabel('Invitation or membership to review').selectOption('invitation:22222222-2222-4222-8222-222222222266')
        await guide.getByRole('button', { name: 'Use this choice', exact: true }).click(); await next(); await next()
      }
    }
    await next()
    if (scenario === 'email-failed') await guide.getByRole('heading', { name: 'Saved—but email failed', exact: true }).waitFor()
    if (scenario === 'viewer') assert.equal(await page.getByRole('button', { name: 'Send invitation', exact: true }).count(), 0)
    await next(); await page.screenshot({ path: resolve(output, `${width}-${scenario}-complete.png`) })
    assert.ok(await guide.evaluate(element => { const box = element.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight && box.right <= innerWidth }))
    const done = page.waitForResponse(response => response.request().method() === 'PUT' && response.request().postDataJSON()?.status === 'Completed')
    await guide.getByRole('button', { name: 'Continue with Household', exact: true }).click(); await done
    assert.equal(checkpoint.status, 'Completed'); assert.equal(sends, creates ? 1 : 0)
    assert.equal(await page.locator('[data-tutorial-inert]').count(), 0); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    results.push({ width, scenario }); console.log(`${width}px: ${scenario}`); await context.close()
  }
  assert.deepEqual(errors, []); await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2))
  console.log(`${results.length} invitation tutorial cases passed; fake intercepted recipients/delivery only, no SMTP or database`)
} finally { await browser?.close(); await server.close() }
