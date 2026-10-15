import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { importId, responseFor, user } from './fixtures.mjs'

// Actual app; synthetic GET responses only. Never forward an API operation to
// an application server. This verifies presentation, not real financial writes.
const phase=process.argv[2]
assert.ok(['before','after','after-final'].includes(phase),'Use before, after or after-final')
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const client=resolve(root,'BudgetApp/budgetapp.client')
const require=createRequire(resolve(client,'package.json'))
const {createServer}=await import(pathToFileURL(require.resolve('vite')).href)
const react=(await import(pathToFileURL(require.resolve('@vitejs/plugin-react')).href)).default
const {chromium}=await import(process.env.BUDGETAPP_QA_PLAYWRIGHT_PATH?pathToFileURL(process.env.BUDGETAPP_QA_PLAYWRIGHT_PATH).href:'playwright')
const directory=resolve(root,'artifacts/refined-ui-qa',phase)
await mkdir(directory,{recursive:true})
const report=resolve(directory,'measurements.json')
try {await readFile(report);throw new Error(`Evidence already exists: ${report}`)}catch(error){if(error.code!=='ENOENT')throw error}
const server=await createServer({root:client,configFile:false,plugins:[react()],server:{host:'127.0.0.1',port:4184,strictPort:true}})
const layouts=[
  {name:'desktop',width:1440,height:1000},{name:'collapsed',width:1440,height:1000,collapsed:true},
  {name:'breakpoint',width:880,height:900},{name:'medium',width:800,height:900},{name:'small-tablet',width:760,height:900},
  {name:'narrow',width:390,height:844},{name:'small-phone',width:320,height:740},
  {name:'zoom-equivalent',width:960,height:540,scale:2},
]
const routes=[
  {name:'dashboard',path:'/dashboard',heading:'Hello, Layout QA user',ready:'.dashboard-metrics'},
  {name:'review',path:`/imports/review?importId=${importId}`,heading:'Review imported rows',ready:'.import-draft-card'},
  {name:'budget',path:'/budgeting?year=2026&month=10',heading:'Monthly budget',ready:'.budget-save-bar'},
  {name:'annual-targets',path:'/budgeting/annual-targets',heading:'Annual targets',ready:'.yearly-target-row'},
  {name:'annual-overview',path:'/budgeting/annual-overview?year=2026',heading:'Annual overview',ready:'.annual-category-row'},
  {name:'account-settings',path:'/settings/account',heading:'Account settings',ready:'.account-settings-details'},
  {name:'household-settings',path:'/household/settings',heading:'Household settings',ready:'.household-settings-form'},
]
let browser
const results=[],errors=[]
try {
  await server.listen()
  browser=await chromium.launch({headless:true,...(process.env.BUDGETAPP_QA_BROWSER_PATH?{executablePath:process.env.BUDGETAPP_QA_BROWSER_PATH}:{})})
  for(const layout of layouts) {
    let contentLane
    for(const route of routes) {
      const context=await browser.newContext({viewport:{width:layout.width,height:layout.height},deviceScaleFactor:layout.scale??1,reducedMotion:'reduce'})
      await context.addInitScript(({id,collapsed})=>localStorage.setItem(`budgetapp.sidebar-collapsed.${id}`,String(collapsed)),{id:user.id,collapsed:Boolean(layout.collapsed)})
      const page=await context.newPage()
      page.on('pageerror',e=>errors.push(e.message))
      await page.route('**/*',async intercepted=>{
        const request=intercepted.request(),url=new URL(request.url())
        if(url.origin!=='http://127.0.0.1:4184'){errors.push(`External request blocked: ${url.origin}`);return intercepted.abort()}
        if(!url.pathname.startsWith('/api/'))return intercepted.continue()
        if(request.method()!=='GET'){errors.push(`Write blocked: ${request.method()} ${url.pathname}`);return intercepted.abort()}
        try{await intercepted.fulfill({json:responseFor(url.pathname)})}catch(error){errors.push(error.message);await intercepted.abort()}
      })
      await page.goto(`http://127.0.0.1:4184${route.path}`)
      await page.getByRole('heading',{name:route.heading,exact:true}).waitFor()
      await page.locator(route.ready).first().waitFor()
      await page.evaluate(()=>document.fonts.ready)
      const metrics=await page.evaluate(()=>{
        const lane=document.querySelector('.page-frame-content').getBoundingClientRect()
        const heading=document.querySelector('main h1')
        const fields=[...document.querySelectorAll('input,select,textarea')].filter(el=>!el.hidden)
        return {lane:{x:lane.x,width:lane.width},scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth,
          headingFont:getComputedStyle(heading).fontFamily,bodyFont:getComputedStyle(document.body).fontFamily,
          minimumFieldFont:fields.length?Math.min(...fields.map(el=>parseFloat(getComputedStyle(el).fontSize))):null}
      })
      assert.ok(metrics.scrollWidth<=metrics.viewport,`${layout.name}/${route.name}: document-wide overflow`)
      if(!contentLane)contentLane=metrics.lane
      assert.deepEqual(metrics.lane,contentLane,`${layout.name}/${route.name}: shared alignment changed between pages`)
      if(phase!=='before')assert.match(metrics.headingFont,/Georgia/)
      if(phase!=='before') {
        const numericStyles=await page.locator('.dashboard-metrics dd, .budget-save-bar strong, .annual-summary-card > strong').evaluateAll(elements=>elements.map(element=>({font:getComputedStyle(element).fontFamily,numerals:getComputedStyle(element).fontVariantNumeric})))
        for(const style of numericStyles) {
          assert.match(style.font,/Segoe UI/,`${route.name}: financial totals use the Hybrid sans-serif stack`)
          assert.match(style.numerals,/lining-nums/)
          assert.match(style.numerals,/tabular-nums/)
        }
      }
      if(['desktop','narrow','zoom-equivalent'].includes(layout.name))await page.screenshot({path:resolve(directory,`${layout.name}-${route.name}.png`),fullPage:true})
      const profile=page.locator('.profile-menu')
      await profile.locator('summary').click()
      await profile.getByRole('link',{name:'Account settings',exact:true}).focus()
      await page.keyboard.press('Escape')
      assert.equal(await profile.getAttribute('open'),null)
      assert.ok(await profile.locator('summary').evaluate(el=>el===document.activeElement))
      if(layout.width<=880) {
        const menu=page.getByRole('button',{name:'Menu',exact:true})
        assert.equal(await page.locator('#app-main-navigation').isVisible(),false)
        await menu.click()
        assert.equal(await page.locator('#app-main-navigation').isVisible(),true)
        const links=page.locator('#app-main-navigation .sidebar-group-heading>a')
        assert.equal(await links.count(),6)
        await page.getByRole('link',{name:'Skip to main content',exact:true}).focus()
        await page.keyboard.press('Enter')
        assert.equal(await menu.getAttribute('aria-expanded'),'false')
        await page.waitForFunction(name=>document.activeElement?.matches('h1')&&document.activeElement.textContent===name,route.heading,{timeout:5000})
      }
      if(route.name==='review') {
        const choice=page.locator('.import-budget-choices label').nth(1)
        const bounds=await choice.evaluate(el=>({right:el.getBoundingClientRect().right,parentRight:el.closest('fieldset').getBoundingClientRect().right}))
        assert.ok(bounds.right<=bounds.parentRight+1,'Budget choice must not bleed into status column')
      }
      if(['budget','annual-targets'].includes(route.name)) {
        await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight))
        const bar=page.locator(route.name==='budget'?'.budget-save-bar':'.yearly-save-bar')
        const back=bar.getByRole('button',{name:'Back to top',exact:true})
        await back.waitFor()
        await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight))
        const rects=await bar.locator('button').evaluateAll(buttons=>buttons.filter(el=>el.getClientRects().length).map(el=>{const r=el.getBoundingClientRect();return {text:el.textContent,x:r.x,y:r.y,right:r.right,bottom:r.bottom}}))
        for(let a=0;a<rects.length;a++)for(let b=a+1;b<rects.length;b++)assert.ok(!(rects[a].x<rects[b].right&&rects[a].right>rects[b].x&&rects[a].y<rects[b].bottom&&rects[a].bottom>rects[b].y),'Budget actions must not overlap')
        if(layout.width<=880)assert.ok(await page.evaluate(()=>document.querySelector('.app-context-header').getBoundingClientRect().top>=document.querySelector('.app-sidebar').getBoundingClientRect().bottom-1),'Stacked headers must not overlap')
      }
      if(phase!=='before'&&route.name==='review') {
        // A client-side oversized-file validation exercises actual feedback/focus
        // without issuing an upload, inspection or any other write request.
        await page.goto('http://127.0.0.1:4184/import')
        const upload=page.getByRole('button',{name:'Upload for review',exact:true})
        await upload.waitFor()
        assert.equal(await upload.isDisabled(),true,'Missing file cannot trigger an upload')
        await page.locator('input[type="file"]').setInputFiles({name:'synthetic-oversize.csv',mimeType:'text/csv',buffer:Buffer.alloc(10*1024*1024+1,32)})
        await page.waitForFunction(()=>!document.querySelector('.import-form button[type="submit"]')?.disabled)
        await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight))
        await upload.click()
        const error=page.getByRole('alert').filter({hasText:'Import files cannot exceed 10 MB.'})
        await error.waitFor()
        await page.waitForFunction(()=>{
          const error=document.querySelector('.error-summary')?.getBoundingClientRect()
          const header=document.querySelector('.app-context-header')?.getBoundingClientRect()
          return error&&header&&error.top>=header.bottom-1&&error.bottom<=innerHeight
        })
      }
      results.push({key:`${layout.name}-${route.name}`,...metrics})
      await context.close()
    }
    console.log(`${phase}: ${layout.name} passed`)
  }
  assert.deepEqual(errors,[])
  await writeFile(report,JSON.stringify({browser:browser.version(),phase,results},null,2))
  console.log(`${results.length} fictional-data page/layout cases passed; evidence: ${directory}`)
} finally {await browser?.close();await server.close()}
