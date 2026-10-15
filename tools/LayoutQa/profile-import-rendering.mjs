import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { importId, responseFor, draftPageFor } from './fixtures.mjs'

// Development React profiling, not production latency. Instrumentation is injected
// by this disposable Vite server only; the application contains no profiling code.
const phase = process.argv[2]
assert.ok(['before', 'after', 'after-final'].includes(phase), 'Use before, after, or after-final')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const client = resolve(root, 'BudgetApp/budgetapp.client')
const require = createRequire(resolve(client, 'package.json'))
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href)
const react = (await import(pathToFileURL(require.resolve('@vitejs/plugin-react')).href)).default
const { chromium } = await import(process.env.BUDGETAPP_QA_PLAYWRIGHT_PATH
  ? pathToFileURL(process.env.BUDGETAPP_QA_PLAYWRIGHT_PATH).href : 'playwright')
const instrumentation = { name: 'isolated-import-profiling', enforce: 'pre', transform(source, id) {
  let code = source.replaceAll('\r\n', '\n')
  if (id.includes('/src/') && code.includes('function DraftRow(')) {
    code = code.replace(/(function DraftRow\([\s\S]*?\}: DraftRowProps\) \{)/,
      '$1\n  window.__importPerf.rowRenders.push(draft.id)')
  }
  if (id.endsWith('/src/pages/ImportReviewPage.tsx')) {
    code = `import { Profiler as ImportQaProfiler } from 'react'\n${code}`
    code = code.replace('export function ImportReviewPage()', 'function ProfiledImportReviewPage()')
    code += `\nexport function ImportReviewPage() { return <ImportQaProfiler id="import-review" onRender={
      (_id, phase, actualDuration, baseDuration, startTime, commitTime) => window.__importPerf.commits.push(
        {phase, actualDuration, baseDuration, startTime, commitTime})
    }><ProfiledImportReviewPage /></ImportQaProfiler> }\n`
  }
  if (id.endsWith('/src/imports/importBudgetInclusion.ts')) {
    code = code.replace('  const changes = new Map',
      '  window.__importPerf.previewCalls++; window.__importPerf.previewRows += drafts.length\n  const changes = new Map')
    code = code.replace('  let changed = 0, skipped = 0, unchanged = 0',
      '  window.__importPerf.previewCalls++; window.__importPerf.previewRows += drafts.length\n  let changed = 0, skipped = 0, unchanged = 0')
  }
  return code === source ? null : { code, map: null }
} }
const server = await createServer({ root: client, configFile: false, plugins: [instrumentation, react()],
  server: { host: '127.0.0.1', port: 4182, strictPort: true } })
const output = resolve(root, `artifacts/import-rendering-qa/${phase}`)
await mkdir(output, { recursive: true })
// Never silently replace a baseline that was captured before editing source.
const resultsPath = resolve(output, 'results.json')
try { await readFile(resultsPath); throw new Error(`Evidence already exists: ${resultsPath}`) }
catch (error) { if (error.code !== 'ENOENT') throw error }
let browser
const results = [], errors = []
try {
  await server.listen()
  browser = await chromium.launch({ headless: true, ...(process.env.BUDGETAPP_QA_BROWSER_PATH
    ? { executablePath: process.env.BUDGETAPP_QA_BROWSER_PATH } : {}) })
  for (let repeat = 0; repeat < 3; repeat++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()
    await page.addInitScript(() => {
      window.__importPerf = { rowRenders: [], commits: [], longTasks: [], previewCalls: 0, previewRows: 0 }
      new PerformanceObserver(list => window.__importPerf.longTasks.push(...list.getEntries().map(
        entry => ({ startTime: entry.startTime, duration: entry.duration })))).observe({ type: 'longtask' })
    })
    const base = responseFor(`/api/households/test/imports/${importId}`)
    const batch = { ...base, totalRows: 10000, validRows: 10000,
      drafts: Array.from({ length: 10000 }, (_, index) => ({ ...base.drafts[0], id: `synthetic-${index}`,
        sourceRowNumber: index + 2, description: `Synthetic purchase ${String(index).padStart(5, '0')}` })) }
    const summary = draftPageFor(batch).summary
    let previews = 0
    page.on('pageerror', error => errors.push(error.message))
    page.on('dialog', dialog => dialog.accept())
    await page.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url())
      if (url.origin !== 'http://127.0.0.1:4182') { errors.push(`External request blocked: ${url.origin}`); return route.abort() }
      if (!url.pathname.startsWith('/api/')) return route.continue()
      let body
      try {
        const suffix = url.pathname.split(`/imports/${importId}`)[1]
        if (request.method() === 'GET' && suffix === '') throw new Error('Full-import read forbidden')
        if (request.method() === 'GET' && url.pathname === '/api/auth/antiforgery') body = { token: 'synthetic-only' }
        else if (request.method() === 'POST' && suffix === '/budget-choice-preview') {
          previews++
          const input = request.postDataJSON()
          assert.equal(input.expectedImportUpdatedAtUtc, summary.updatedAtUtc)
          body = { items: batch.drafts, skipped: 0, unchanged: 0, updatedAtUtc: summary.updatedAtUtc }
        } else {
          assert.equal(request.method(), 'GET', 'No API writes are allowed')
          if (suffix === '/drafts') body = draftPageFor(batch, url.searchParams)
          else if (url.pathname.endsWith('/imports')) body = { items: [{ ...summary, ...summary.counts,
            uploadedAtUtc: '2026-10-14T12:00:00Z' }], page: 1, pageSize: 50, totalCount: 1, totalPages: 1, totalVisibleCount: 1 }
          else body = responseFor(url.pathname)
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
      } catch (error) { errors.push(error.message); await route.abort() }
    })
    const settle = () => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 50)))))
    async function measure(name, action) {
      await settle()
      await page.evaluate(() => { window.__importPerf = { rowRenders: [], commits: [], longTasks: [], previewCalls: 0, previewRows: 0 }; window.__importPerf.start = performance.now() })
      const readsBefore = previews
      await action()
      await settle()
      const metrics = await page.evaluate(() => {
        const data = window.__importPerf
        return { elapsedMs: performance.now() - data.start, commits: data.commits.length,
          reactActualMs: data.commits.reduce((sum, commit) => sum + commit.actualDuration, 0),
          rowRenders: data.rowRenders.length, renderedRowIds: [...new Set(data.rowRenders)],
          previewCalls: data.previewCalls, previewRows: data.previewRows,
          longTasks: data.longTasks.length, longestTaskMs: Math.max(0, ...data.longTasks.map(task => task.duration)) }
      })
      results.push({ repeat, operation: name, ...metrics, previewRequests: previews - readsBefore })
    }
    await page.goto(`http://127.0.0.1:4182/imports/review?importId=${importId}`)
    await page.waitForFunction(() => document.querySelectorAll('.import-draft-card').length === 100 &&
      !document.querySelector('.import-description-field input').disabled)
    const description = page.getByLabel('Description', { exact: true }).first()
    const characters = ' abcdefghijklmnopqrs'
    await description.focus(); await description.press('End')
    await measure('typing-no-preset', () => description.pressSequentially(characters, { delay: 16 }))
    assert.equal(await page.getByRole('article').count(), 100)
    await measure('filtering', async () => {
      await page.locator('.import-row-toolbar select').selectOption('categorized')
      await page.getByText('No rows match this filter.', { exact: true }).waitFor()
      await page.locator('.import-row-toolbar select').selectOption('all')
      await description.waitFor()
    })
    await measure('bulk-selection', async () => {
      await page.locator('.import-bulk-budget-controls select').first().selectOption('PersonalAndHousehold')
      await page.getByRole('button', { name: 'Apply budget choices (10000)', exact: true }).waitFor()
    })
    await measure('bulk-staging', async () => {
      await page.getByRole('button', { name: 'Apply budget choices (10000)', exact: true }).click()
      await page.getByRole('button', { name: 'Save all corrections (10000)', exact: true }).waitFor()
    })
    await description.focus(); await description.press('End')
    await measure('typing-with-10000-staged', () => description.pressSequentially(characters, { delay: 16 }))
    assert.ok((await description.inputValue()).endsWith(characters + characters))
    assert.equal(await page.getByRole('article').count(), 100)
    await context.close()
  }
  assert.deepEqual(errors, [])
  await writeFile(resultsPath, JSON.stringify({ phase, browser: browser.version(), node: process.version,
    rows: 10000, visibleRows: 100, repeats: 3, build: 'Vite development / React Profiler / StrictMode', results }, null, 2))
  for (const operation of [...new Set(results.map(result => result.operation))]) {
    const samples = results.filter(result => result.operation === operation)
    const average = key => Math.round(samples.reduce((sum, sample) => sum + sample[key], 0) / samples.length * 100) / 100
    console.log(JSON.stringify({ operation, averageCommits: average('commits'), averageReactMs: average('reactActualMs'),
      averageRowRenders: average('rowRenders'), averagePreviewRows: average('previewRows'), longestTaskMs: Math.max(...samples.map(result => result.longestTaskMs)) }))
  }
  console.log(`Saved ${resultsPath}`)
} catch (error) {
  console.error(JSON.stringify({ fictionalRequestErrors: errors }))
  throw error
} finally { await browser?.close(); await server.close() }
