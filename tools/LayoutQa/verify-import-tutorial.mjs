import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { responseFor, importId, draftPageFor } from './fixtures.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const client = resolve(root, 'BudgetApp/budgetapp.client')
const require = createRequire(resolve(client, 'package.json'))
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href)
const react = (await import(pathToFileURL(require.resolve('@vitejs/plugin-react')).href)).default
const { chromium } = await import(process.env.BUDGETAPP_QA_PLAYWRIGHT_PATH ? pathToFileURL(process.env.BUDGETAPP_QA_PLAYWRIGHT_PATH).href : 'playwright')
const output = resolve(root, 'artifacts/import-tutorial-qa')
await mkdir(output, { recursive: true })
const server = await createServer({ root: client, configFile: false, plugins: [react()], server: { host: '127.0.0.1', port: 4193, strictPort: true } })
const results = [], errors = []
async function assertRingTracksTarget(page) {
  await page.waitForFunction(() => {
    const target = document.querySelector('.tutorial-task-target')
    const ring = document.querySelector('.tutorial-spotlight')
    if (!(target instanceof HTMLElement) || !(ring instanceof HTMLElement)) return false
    const box = target.getBoundingClientRect()
    const top = Math.max(0, box.top - 8), left = Math.max(0, box.left - 8)
    const right = Math.min(innerWidth, box.right + 8), bottom = Math.min(innerHeight, box.bottom + 8)
    return Math.abs(parseFloat(ring.style.top) - top) < 1 && Math.abs(parseFloat(ring.style.left) - left) < 1 &&
      Math.abs(parseFloat(ring.style.width) - (right - left)) < 1 && Math.abs(parseFloat(ring.style.height) - (bottom - top)) < 1
  })
}
let browser
try {
  await server.listen()
  browser = await chromium.launch({ headless: true, ...(process.env.BUDGETAPP_QA_BROWSER_PATH ? { executablePath: process.env.BUDGETAPP_QA_BROWSER_PATH } : {}) })
  for (const width of [1440, 390, 320]) for (const scenario of ['csv', 'xlsx', 'mapping', 'completed', 'viewer-denied', 'failed-upload', 'duplicate-upload', 'lost-completion']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 500, reducedMotion: 'reduce' })
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => {
      if (message.type() === 'error' && !/Failed to load resource|net::ERR/.test(message.text())) errors.push(message.text())
    })
    page.on('dialog', dialog => dialog.accept())
    const base = responseFor(`/api/households/layout-household/imports/${importId}`)
    let detail = { ...base, totalRows: 3, validRows: 3, approvedRows: scenario === 'completed' ? 3 : 0,
      status: scenario === 'completed' ? 'Completed' : 'ReadyForReview', drafts: base.drafts.slice(0, 3).map(row => ({ ...row,
        reviewDecision: scenario === 'completed' ? 'Approved' : 'Pending', approvedTransactionId: scenario === 'completed' ? `tx-${row.id}` : null })) }
    let stagePosts = 0, createPosts = 0, profilePosts = 0, decisionPosts = 0, inspections = 0, savePuts = 0
    const checkpoints = []
    const profile = { ...responseFor('/api/households/layout-household/import-profiles')[0], id: 'synthetic-created-profile', headers: ['Booked', 'Memo', 'Value'],
      dateColumn: 'Booked', descriptionColumn: 'Memo', amountColumn: 'Value' }
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname
      if (url.origin !== 'http://127.0.0.1:4193') { errors.push('External request blocked'); return route.abort() }
      if (!path.startsWith('/api/')) return route.continue()
      try {
        if (path === '/api/auth/antiforgery') return route.fulfill({ json: { token: 'synthetic-only' } })
        if (request.method() === 'PUT' && path === '/api/tutorial-progress/import-review') {
          const body = request.postDataJSON(); assert.deepEqual(Object.keys(body).sort(), ['currentStepIndex', 'status', 'tutorialVersion'])
          checkpoints.push(body)
          return route.fulfill({ json: { ...body, tutorialKey: 'import-review', startedAtUtc: '2026-10-15', updatedAtUtc: '2026-10-15',
            completedAtUtc: body.status === 'Completed' ? '2026-10-15' : null, dismissedAtUtc: null } })
        }
        if (request.method() === 'PUT' && path.endsWith('/drafts')) {
          const updates = request.postDataJSON().drafts
          assert.equal(scenario, 'csv')
          assert.equal(updates.length, 3)
          assert.ok(updates.every(row => row.includeInPersonalBudget && row.includeInHouseholdBudget))
          savePuts++
          detail = { ...detail, updatedAtUtc: '2026-10-14T12:00:00.0000001+00:00', drafts: detail.drafts.map(row => {
            const change = updates.find(item => item.draftId === row.id)
            return change ? { ...row, ...change, reviewDecision: 'Pending' } : row
          }) }
          return route.fulfill({ json: { summary: draftPageFor(detail).summary, items: detail.drafts, removedDraftIds: [], savedRows: 3 } })
        }
        if (request.method() === 'POST' && path.endsWith('/import-profiles/inspect')) {
          inspections++
          return route.fulfill({ json: { headers: scenario === 'mapping' ? profile.headers : ['Date', 'Description', 'Amount'],
            previewRows: [['2026-10-01', 'Synthetic purchase', '12.3456']], matchedProfile: null, suggestedProfile: scenario === 'mapping' ? profile : null,
            worksheets: [{ id: '1', name: 'Transactions', isHidden: false, transactionRows: 3, problem: null }],
            selectedWorksheetId: '1', selectedWorksheetName: 'Transactions', previewRowNumbers: [2] } })
        }
        if (request.method() === 'POST' && path.endsWith('/import-profiles')) { profilePosts++; return route.fulfill({ json: profile }) }
        if (request.method() === 'POST' && path.endsWith('/imports')) {
          stagePosts++
          if (scenario === 'failed-upload') return route.fulfill({ status: 503, json: { title: 'Synthetic staging failure', detail: 'Check saved import status before trying another upload.' } })
          if (scenario === 'duplicate-upload' && stagePosts === 1) return route.fulfill({ status: 409, json: {
            title: 'Duplicate file', detail: 'This account already has an import with the same file contents. Confirm that you want to import it again.' } })
          return route.fulfill({ status: 201, json: { ...detail, importFileId: importId } })
        }
        if (request.method() === 'POST' && path.endsWith('/decisions')) {
          decisionPosts++; detail = { ...detail, approvedRows: 3, drafts: detail.drafts.map(row => ({ ...row, reviewDecision: 'Approved' })) }
          return route.fulfill({ status: 204 })
        }
        if (request.method() === 'POST' && path.endsWith('/complete')) {
          createPosts++; detail = { ...detail, status: 'Completed', drafts: detail.drafts.map(row => ({ ...row, approvedTransactionId: `tx-${row.id}` })) }
          if (scenario === 'lost-completion') return route.abort()
          return route.fulfill({ json: { importFileId: importId, status: 'Completed', createdTransactionCount: 3, approvedRows: 3, excludedRows: 0 } })
        }
        if (request.method() !== 'GET') { errors.push(`Unexpected write blocked: ${path}`); return route.abort() }
        if (path.endsWith('/drafts')) return route.fulfill({ json: draftPageFor(detail, url.searchParams) })
        if (path.endsWith('/imports')) return route.fulfill({ json: { items: [detail], page: 1, pageSize: 50, totalCount: 1, totalPages: 1, totalVisibleCount: 1 } })
        let data = responseFor(path, { viewer: scenario === 'viewer-denied' })
        if (path.endsWith('/accounts') && scenario === 'viewer-denied') data = data.map(account => ({ ...account, scope: 'Household', ownerUserId: null }))
        return route.fulfill({ json: data })
      } catch (error) { errors.push(error.message); return route.abort() }
    })
    await page.goto('http://127.0.0.1:4193/tutorials')
    const card = page.locator('.tutorial-card').filter({ has: page.getByRole('heading', { name: 'Import and review transactions', exact: true }) })
    await card.getByRole('button', { name: 'Start tutorial', exact: true }).click()
    const guide = page.getByRole('region', { name: 'Import and review transactions tutorial controls', exact: true })
    await guide.getByRole('heading', { name: 'Choose your import task', exact: true }).waitFor()
    if (scenario === 'csv') await page.screenshot({ path: resolve(output, `${width}-start.png`) })
    if (scenario === 'completed') {
      await guide.getByRole('button', { name: 'Continue an existing import', exact: true }).click()
      await guide.getByRole('button', { name: 'Verify completed import', exact: true }).click()
      await guide.getByRole('button', { name: 'Finish', exact: true }).click()
      assert.equal(stagePosts + decisionPosts + createPosts, 0)
    } else {
      await guide.getByRole('button', { name: 'New CSV/Excel upload', exact: true }).click()
      if (scenario === 'csv') await page.screenshot({ path: resolve(output, `${width}-account.png`) })
      if (scenario === 'viewer-denied') {
        await guide.getByText(/Choose an active account you may import into/).waitFor()
        assert.ok(await guide.getByRole('button', { name: 'Next', exact: true }).isDisabled())
      } else {
        await guide.getByRole('button', { name: 'Use this account', exact: true }).click()
        await page.getByLabel(/^CSV or Excel file/).setInputFiles({ name: scenario === 'xlsx' ? 'synthetic.xlsx' : 'synthetic.csv', mimeType: 'application/octet-stream', buffer: Buffer.from('Synthetic UI fixture; reader is intercepted') })
        await guide.getByRole('button', { name: 'Review file settings', exact: true }).click()
        if (scenario === 'csv') {
          await page.screenshot({ path: resolve(output, `${width}-upload.png`) })
          const before = await guide.boundingBox()
          // Reproduce the old crop: move the button down across the dock's top.
          await page.evaluate(() => window.scrollBy({ top: -120, behavior: 'instant' }))
          await assertRingTracksTarget(page)
          const after = await guide.boundingBox()
          assert.ok(Math.abs(before.y - after.y) < 1, 'Coach moved when the page scrolled')
          await page.screenshot({ path: resolve(output, `${width}-scroll.png`) })
          await guide.getByRole('button', { name: 'Show me', exact: true }).click()
          await assertRingTracksTarget(page)
        }
        assert.equal(stagePosts + profilePosts + decisionPosts + createPosts, 0)
        assert.ok(await guide.getByRole('button', { name: 'Next', exact: true }).isDisabled())
        if (scenario === 'xlsx') {
          await page.getByRole('button', { name: 'Preview workbook', exact: true }).click()
          await page.getByRole('heading', { name: 'Choose one worksheet', exact: true }).waitFor()
          assert.equal(stagePosts, 0)
        }
        await page.getByRole('button', { name: 'Upload for review', exact: true }).click()
        if (scenario === 'mapping') {
          await page.getByRole('heading', { name: 'Map these columns once', exact: true }).waitFor()
          assert.equal(stagePosts + profilePosts, 0)
          await page.getByRole('button', { name: 'Save profile and upload', exact: true }).click()
        }
        if (scenario === 'failed-upload') {
          await page.getByText('Check saved import status before trying another upload.', { exact: true }).waitFor()
          await guide.getByText('Needs attention', { exact: true }).waitFor()
          assert.equal(await page.locator('.tutorial-blocker').count(), 0)
          const notice = page.getByRole('alert', { name: 'Error notification', exact: true })
          await notice.waitFor()
          assert.ok(await notice.evaluate(element => getComputedStyle(element).position === 'fixed'))
          await page.screenshot({ path: resolve(output, `${width}-error.png`) })
          assert.ok(await guide.getByRole('button', { name: 'Next', exact: true }).isDisabled())
          await guide.getByText('More details', { exact: true }).click()
          await guide.getByRole('button', { name: 'Restart task selection', exact: true }).click()
          assert.equal(stagePosts, 1); assert.equal(createPosts, 0)
        } else {
          if (scenario === 'duplicate-upload') {
            const notice = page.getByRole('alert', { name: 'Error notification', exact: true })
            await notice.getByText(/already has an import/).waitFor()
            await guide.getByText('Needs attention', { exact: true }).waitFor()
            assert.equal(await page.locator('.tutorial-blocker').count(), 0)
            assert.ok(await guide.getByRole('button', { name: 'Next', exact: true }).isDisabled())
            await guide.getByRole('button', { name: 'Show error', exact: true }).click()
            await page.screenshot({ path: resolve(output, `${width}-duplicate.png`) })
            assert.equal(stagePosts, 1)
            await notice.getByRole('button', { name: 'Dismiss error notification', exact: true }).click()
            assert.equal(await page.locator('.error-notice').count(), 0)
            await page.getByText(/already has an import/).waitFor()
            await page.getByRole('checkbox', { name: /Allow this file to be imported again/ }).check()
            assert.equal(stagePosts, 1, 'Acknowledgment must not upload automatically')
            await page.getByRole('button', { name: 'Upload for review', exact: true }).click()
          }
          if (scenario === 'csv' || scenario === 'xlsx' || scenario === 'duplicate-upload') {
            await page.getByRole('link', { name: 'Review this import', exact: true }).click()
            await guide.getByRole('heading', { name: 'Confirm the selected import', exact: true }).waitFor()
          } else await guide.getByRole('button', { name: 'Review staged import', exact: true }).click()
          await guide.getByRole('button', { name: 'Use this import', exact: true }).click()
          if (scenario === 'csv') await page.screenshot({ path: resolve(output, `${width}-rows.png`) })
          if (scenario === 'csv') {
            await assertRingTracksTarget(page)
            await page.getByRole('region', { name: 'Imported transactions', exact: true }).evaluate(element => { element.scrollLeft = Math.max(0, element.scrollLeft - 30) })
            await assertRingTracksTarget(page)
          }
          await guide.getByRole('button', { name: 'Review budget inclusion', exact: true }).click()
          if (scenario === 'csv') {
            const tools = page.locator('[data-tutorial-id="import-bulk-budget-tools"]')
            await tools.getByRole('heading', { name: 'Set budgets for multiple rows', exact: true }).waitFor()
            await assertRingTracksTarget(page)
            await page.screenshot({ path: resolve(output, `${width}-budgets.png`) })
            assert.equal(savePuts, 0)
            assert.ok(await guide.getByRole('button', { name: 'Review decisions', exact: true }).isEnabled(), 'Keeping existing choices should be allowed')
            await tools.getByLabel(/^Apply to/).selectOption('page')
            await tools.getByLabel(/^Bulk budget inclusion/).selectOption('PersonalAndHousehold')
            await tools.getByRole('button', { name: 'Apply budget choices (3)', exact: true }).click()
            assert.equal(savePuts, 0, 'Applying staged choices must not save automatically')
            assert.ok(await guide.getByRole('button', { name: 'Next', exact: true }).isDisabled())
            await tools.getByRole('button', { name: 'Save all corrections (3)', exact: true }).click()
          }
          await guide.getByRole('button', { name: 'Review decisions', exact: true }).click()
          assert.ok(await guide.getByRole('button', { name: 'Next', exact: true }).isDisabled())
          await page.getByRole('button', { name: 'Approve all valid', exact: true }).click()
          await guide.getByRole('button', { name: 'Review final creation', exact: true }).click()
          if (scenario === 'csv') await page.screenshot({ path: resolve(output, `${width}-create.png`) })
          assert.equal(createPosts, 0)
          await page.getByRole('button', { name: 'Create approved transactions', exact: true }).click()
          if (scenario === 'lost-completion') {
            await page.getByText(/The save result is uncertain or this import changed elsewhere/).waitFor()
            assert.ok(await guide.getByRole('button', { name: 'Next', exact: true }).isDisabled())
            await page.getByRole('button', { name: 'Refresh selected import', exact: true }).click()
          }
          await guide.getByRole('button', { name: 'Verify completed import', exact: true }).click()
          await page.screenshot({ path: resolve(output, `${width}-${scenario}.png`) })
          assert.ok(await page.locator('.tutorial-blocker').count() > 0)
          assert.ok(await guide.evaluate(element => getComputedStyle(element).position === 'fixed'))
          assert.ok(await guide.evaluate(element => {
            const bounds = element.getBoundingClientRect()
            return bounds.top >= 0 && bounds.bottom <= innerHeight && bounds.left >= 0 && bounds.right <= innerWidth
          }), `${width}/${scenario}: coach outside viewport`)
          assert.equal(await guide.locator('details').getAttribute('open'), null)
          await guide.getByRole('button', { name: 'Show me', exact: true }).click()
          const target = page.locator('[data-tutorial-id="import-completion-summary"]')
          assert.ok(await target.evaluate(element => {
            const bounds = element.getBoundingClientRect()
            const header = document.querySelector('.app-context-header')?.getBoundingClientRect()
            const coach = document.querySelector('.tutorial-task-guide .tutorial-coach-card')?.getBoundingClientRect()
            return bounds.top >= (header?.bottom ?? 0) && bounds.bottom <= (coach?.top ?? innerHeight)
          }), `${width}/${scenario}: completion controls obscured`)
          await guide.getByRole('button', { name: 'Finish', exact: true }).click()
          assert.equal(stagePosts, scenario === 'duplicate-upload' ? 2 : 1); assert.equal(decisionPosts, 1); assert.equal(createPosts, 1)
          assert.equal(profilePosts, scenario === 'mapping' ? 1 : 0)
          assert.equal(savePuts, scenario === 'csv' ? 1 : 0)
        }
      }
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}/${scenario}: page-wide overflow`)
    if (await guide.count()) { await guide.getByRole('button', { name: 'Exit tutorial', exact: true }).click() }
    assert.equal(await page.locator('[data-tutorial-inert]').count(), 0)
    results.push({ width, scenario, stagePosts, profilePosts, decisionPosts, createPosts, inspections, savePuts, checkpoints: checkpoints.length })
    console.log(`${width}px: ${scenario}`)
    await context.close()
  }
  assert.deepEqual(errors, [])
  await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2))
  console.log(`${results.length} synthetic import-tutorial browser cases passed; all API writes intercepted, no database/email used`)
} finally { await browser?.close(); await server.close() }
