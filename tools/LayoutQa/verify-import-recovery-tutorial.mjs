// Synthetic/intercepted imports and undo responses. Never connects to a DB.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { responseFor, importId, draftPageFor } from './fixtures.mjs'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), client = resolve(root, 'BudgetApp/budgetapp.client')
const require = createRequire(resolve(client, 'package.json'))
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href)
const react = (await import(pathToFileURL(require.resolve('@vitejs/plugin-react')).href)).default
const { chromium } = await import(process.env.BUDGETAPP_QA_PLAYWRIGHT_PATH ? pathToFileURL(process.env.BUDGETAPP_QA_PLAYWRIGHT_PATH).href : 'playwright')
const output = resolve(root, 'artifacts/import-recovery-tutorial-qa'); await mkdir(output, { recursive: true })
const server = await createServer({ root: client, configFile: false, plugins: [react()], server: { host: '127.0.0.1', port: 4203, strictPort: true } })
const results = [], errors = []; let browser
try {
  await server.listen(); browser = await chromium.launch({ headless: true, ...(process.env.BUDGETAPP_QA_BROWSER_PATH ? { executablePath: process.env.BUDGETAPP_QA_BROWSER_PATH } : {}) })
  for (const width of [1440, 390, 320]) for (const scenario of ['correct', 'discard', 'cancel-discard', 'undo', 'blocked', 'already-undone', 'viewer', 'lost-reply', 'failed-preview']) {
    const context = await browser.newContext({ viewport: { width, height: width === 320 ? 740 : 900 }, reducedMotion: 'reduce' }), page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message)); let acceptDialog = true; page.on('dialog', dialog => acceptDialog ? dialog.accept() : dialog.dismiss())
    const completed = !['correct', 'discard', 'cancel-discard'].includes(scenario)
    const batch = responseFor(`/api/households/layout-household/imports/${importId}`)
    batch.drafts = batch.drafts.slice(0, 1); batch.totalRows = batch.validRows = 1; batch.approvedRows = completed ? 1 : 0
    batch.status = scenario === 'already-undone' ? 'Reversed' : completed ? 'Completed' : 'ReadyForReview'; batch.canEdit = scenario !== 'viewer'
    let undoWrites = 0, discardWrites = 0, discarded = false, checkpoint = null, failPreview = scenario === 'failed-preview'
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method()
      if (url.origin !== 'http://127.0.0.1:4203') { errors.push('External request blocked'); return route.abort() }
      if (!path.startsWith('/api/')) return route.continue()
      if (method === 'GET' && path === '/api/auth/antiforgery') return route.fulfill({ json: { token: 'synthetic' } })
      if (method === 'PUT' && path === '/api/tutorial-progress/fix-mistaken-import') {
        const body = request.postDataJSON(); assert.deepEqual(Object.keys(body).sort(), ['currentStepIndex', 'status', 'tutorialVersion'])
        checkpoint = { ...body, tutorialKey: 'fix-mistaken-import', startedAtUtc: '', updatedAtUtc: '', completedAtUtc: null, dismissedAtUtc: null }; return route.fulfill({ json: checkpoint })
      }
      if (method === 'POST' && path.endsWith('/reverse')) {
        assert.ok(['undo', 'lost-reply'].includes(scenario)); assert.equal(++undoWrites, 1); batch.status = 'Reversed'
        return scenario === 'lost-reply' ? route.abort() : route.fulfill({ json: { importFileId: importId, status: 'Reversed', reversedTransactionCount: 1, updatedAtUtc: '2026-10-16T12:00:00Z', alreadyReversed: false } })
      }
      if (method === 'DELETE' && path.endsWith(`/imports/${importId}`)) {
        assert.equal(scenario, 'discard'); assert.equal(++discardWrites, 1); discarded = true; return route.fulfill({ status: 204 })
      }
      if (method !== 'GET') { errors.push(`Unexpected write ${method} ${path}`); return route.abort() }
      if (path === '/api/tutorial-progress') return route.fulfill({ json: checkpoint ? [checkpoint] : [] })
      if (path.endsWith('/imports')) return route.fulfill({ json: { items: discarded ? [] : [batch], page: 1, pageSize: 25, totalCount: discarded ? 0 : 1, totalPages: discarded ? 0 : 1, totalVisibleCount: discarded ? 0 : 1 } })
      if (path.endsWith(`/imports/${importId}/drafts`)) return route.fulfill({ json: draftPageFor(batch, url.searchParams) })
      if (path.endsWith('/reversal-preview')) {
        if (failPreview) return route.fulfill({ status: 503, json: { detail: 'Synthetic preview failure' } })
        return route.fulfill({ json: { previewVersion: 'A'.repeat(64), status: batch.status, importFileId: importId, originalFileName: batch.originalFileName,
          sourceWorksheetName: batch.sourceWorksheetName, accountName: batch.accountName, currency: 'CAD', importUpdatedAtUtc: '2026-10-15T12:00:00Z', checkedAtUtc: '2026-10-16T12:00:00Z',
          canReverse: scenario !== 'blocked' && batch.status !== 'Reversed', linkedTransactionCount: 1, eligibleRowCount: scenario === 'blocked' ? 0 : 1, blockedRowCount: scenario === 'blocked' ? 1 : 0,
          blockingReasons: scenario === 'blocked' ? ['Synthetic transaction was edited.'] : [], items: [], page: 1, pageSize: 100, totalCount: 0, totalPages: 1 } })
      }
      try { return route.fulfill({ json: responseFor(path, { viewer: scenario === 'viewer' }) }) } catch (error) { errors.push(error.message); return route.abort() }
    })
    const clickPage = async locator => {
      await locator.scrollIntoViewIfNeeded(); await locator.evaluate(element => {
        const header = document.querySelector('.app-context-header')?.getBoundingClientRect().bottom ?? 128, coach = document.querySelector('.tutorial-coach-card')?.getBoundingClientRect().top ?? innerHeight, box = element.getBoundingClientRect()
        if (box.top < header + 8 || box.bottom > coach - 8) window.scrollBy(0, box.top - header - 16)
      }); await locator.click()
    }
    await page.goto('http://127.0.0.1:4203/tutorials')
    await page.locator('.tutorial-card').filter({ has: page.getByRole('heading', { name: 'Fix a mistaken import', exact: true }) }).getByRole('button', { name: 'Start tutorial', exact: true }).click()
    const guide = page.getByRole('region', { name: 'Fix a mistaken import tutorial controls' }), next = () => guide.getByRole('button', { name: 'Next', exact: true }).click()
    await guide.getByRole('button', { name: 'Use this import', exact: true }).click()
    if (['already-undone', 'viewer'].includes(scenario)) {
      assert.equal(await page.getByRole('button', { name: 'Undo import', exact: true }).count(), 0)
      await guide.getByRole('button', { name: 'Review without changing', exact: true }).click()
    } else {
      await guide.getByRole('button', { name: scenario === 'correct' ? 'Correct staged rows' : completed ? 'Check completed Undo' : 'Check staged discard', exact: true }).click()
      if (completed) {
        await clickPage(page.getByRole('button', { name: 'Preview undo', exact: true }))
        if (failPreview) { await guide.getByText('Needs attention').waitFor(); failPreview = false; await clickPage(page.getByRole('button', { name: 'Retry loading', exact: true })) }
      }
      await next(); assert.equal(undoWrites + discardWrites, 0)
      if (scenario === 'discard' || scenario === 'cancel-discard') {
        acceptDialog = scenario !== 'cancel-discard'; await clickPage(page.getByRole('button', { name: 'Discard staged import', exact: true })); acceptDialog = true
      }
      if (scenario === 'undo' || scenario === 'lost-reply') {
        await clickPage(page.getByRole('button', { name: 'Undo import', exact: true }))
        if (scenario === 'lost-reply') { await page.getByText('Refresh the undo preview to check the saved status before trying again.', { exact: true }).waitFor(); await clickPage(page.getByRole('button', { name: 'Refresh data', exact: true })) }
      }
      if (['blocked', 'cancel-discard', 'failed-preview'].includes(scenario)) await guide.getByRole('button', { name: 'Keep unchanged', exact: true }).click()
      else await next()
    }
    await next(); await page.screenshot({ path: resolve(output, `${width}-${scenario}-complete.png`) })
    assert.ok(await guide.evaluate(element => { const box = element.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight && box.right <= innerWidth }))
    const done = page.waitForResponse(response => response.request().method() === 'PUT' && response.request().postDataJSON()?.status === 'Completed')
    await guide.getByRole('button', { name: 'Continue import review', exact: true }).click(); await done
    assert.equal(checkpoint.status, 'Completed'); assert.equal(undoWrites, ['undo', 'lost-reply'].includes(scenario) ? 1 : 0); assert.equal(discardWrites, scenario === 'discard' ? 1 : 0)
    assert.equal(await page.locator('[data-tutorial-inert]').count(), 0); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    results.push({ width, scenario }); console.log(`${width}px: ${scenario}`); await context.close()
  }
  assert.deepEqual(errors, []); await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2)); console.log(`${results.length} import recovery cases passed; synthetic intercepted commands only`)
} finally { await browser?.close(); await server.close() }
