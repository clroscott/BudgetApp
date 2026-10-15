import assert from 'node:assert/strict'
import {mkdir, writeFile, readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {dirname, resolve} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {responseFor, importId} from './fixtures.mjs'

// Disposable browser, fictional GET fixtures only: never contacts an app server.
const mode=process.argv[2]??'after'
assert.ok(['before','after','interactions'].includes(mode))
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const client=resolve(root,'BudgetApp/budgetapp.client'),require=createRequire(resolve(client,'package.json'))
const {createServer}=await import(pathToFileURL(require.resolve('vite')).href)
const react=(await import(pathToFileURL(require.resolve('@vitejs/plugin-react')).href)).default
const {chromium}=await import(process.env.BUDGETAPP_QA_PLAYWRIGHT_PATH?pathToFileURL(process.env.BUDGETAPP_QA_PLAYWRIGHT_PATH).href:'playwright')
const sharp=require('sharp')
const output=resolve(root,'artifacts/mobile-ui-qa',mode)
await mkdir(output,{recursive:true})
if(mode==='before'){
 try{await readFile(resolve(output,'results.json'));throw new Error('Baseline already exists; do not overwrite it after changing source.')}
 catch(error){if(error.code!=='ENOENT')throw error}
}
const routes=[
 ['dashboard','/dashboard','.dashboard-metrics'],
 ['transactions','/transactions','.transaction-row'],
 ['upload','/import','.import-form select option[value="layout-account"]'],
 ['review',`/imports/review?importId=${importId}`,'.import-draft-card'],
 ['rules','/settings/categorization-rules','.rule-row'],
 ['profiles','/settings/import-profiles','.account-card'],
 ['budget','/budgeting?year=2026&month=10','.budget-save-bar'],
 ['annual-targets','/budgeting/annual-targets','.yearly-target-row'],
 ['annual-overview','/budgeting/annual-overview?year=2026','.annual-category-row'],
 ['recurring','/budgeting/recurring-expenses','.recurring-card'],
 ['categories','/settings/categories','.category-row'],
 ['accounts','/accounts','.account-card'],
 ['activity','/activity','.activity-card'],
 ['household','/household','.household-member-row'],
 ['household-settings','/household/settings','.household-settings-form',{multipleHouseholds:true}],
 ['account-settings','/settings/account','.account-settings-details'],
 ['account-no-household','/settings/account','.account-settings-details',{noHousehold:true}],
 ['help','/help','.help-topic-list'],
]
const layouts=mode==='before'?[{name:'desktop',width:1440,height:1000},{name:'phone',width:390,height:844}]:[
 {name:'desktop',width:1440,height:1000}, {name:'phone',width:390,height:844,touch:true},
 {name:'small-phone',width:320,height:740,touch:true}, {name:'landscape',width:844,height:390,touch:true},
 {name:'tablet',width:880,height:900,touch:true},{name:'zoom-equivalent',width:960,height:540,scale:2},
]
const selected=mode==='before'?routes.filter(([name])=>['dashboard','review','budget'].includes(name))
 :mode==='interactions'?routes.filter(([name])=>['budget','annual-targets'].includes(name)):routes
const server=await createServer({root:client,configFile:false,plugins:[react()],server:{host:'127.0.0.1',port:4190,strictPort:true}})
const results=[],errors=[]
let browser
try{
 await server.listen()
 browser=await chromium.launch({headless:true,...(process.env.BUDGETAPP_QA_BROWSER_PATH?{executablePath:process.env.BUDGETAPP_QA_BROWSER_PATH}:{})})
 for(const layout of layouts.filter(item=>!process.argv[3]||item.name===process.argv[3]))for(const [name,path,ready,options={}] of selected){
  const context=await browser.newContext({viewport:{width:layout.width,height:layout.height},deviceScaleFactor:layout.scale??1,hasTouch:layout.touch??false,reducedMotion:'reduce'})
  const page=await context.newPage()
  page.on('pageerror',e=>errors.push(`${layout.name}/${name}: ${e.message}`))
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url())
   if(url.origin!=='http://127.0.0.1:4190'){errors.push(`Blocked external request ${url.origin}`);return route.abort()}
   if(!url.pathname.startsWith('/api/'))return route.continue()
   if(request.method()!=='GET'){errors.push(`Blocked write ${request.method()} ${url.pathname}`);return route.abort()}
   try{return route.fulfill({json:url.pathname==='/api/tutorial-progress'?[{tutorialKey:'getting-started',tutorialVersion:1,status:'Dismissed',currentStepIndex:0}]:responseFor(url.pathname,{mfa:true,...options})})}
   catch(e){errors.push(e.message);return route.abort()}
  })
  await page.goto(`http://127.0.0.1:4190${path}`)
  await page.locator(ready).first().waitFor({state:ready.includes('option[')?'attached':'visible'})
  await page.evaluate(()=>document.fonts.ready)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${layout.name}/${name}: page overflow`)
  const menu=page.getByRole('button',{name:'Menu',exact:true})
  if(mode!=='before'&&layout.width<=880&&!options.noHousehold){
   const header=page.locator('.app-sidebar'),nav=page.getByRole('navigation',{name:'Main navigation'})
   const before=await header.boundingBox()
   await menu.click()
   assert.equal(await nav.isVisible(),true)
   const after=await header.boundingBox(),bounds=await nav.boundingBox()
   assert.equal(after.height,before.height,'Mobile menu must not push down the page')
   assert.ok(bounds.y>=after.y+after.height-1&&bounds.y+bounds.height<=layout.height,'Menu fits short/phone viewport')
   const lastLink=nav.getByRole('link').last()
   await lastLink.scrollIntoViewIfNeeded()
   assert.ok(await lastLink.evaluate(element=>{const r=element.getBoundingClientRect();return element.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}),'Menu links paint above fixed budget actions')
   await nav.getByRole('link',{name:'Dashboard',exact:true}).focus()
   await page.keyboard.press('Escape')
   assert.equal(await menu.getAttribute('aria-expanded'),'false')
   assert.equal(await menu.evaluate(e=>e===document.activeElement),true)
   await menu.click()
   await page.mouse.click(2,150)
   assert.equal(await menu.getAttribute('aria-expanded'),'false','Outside tap dismisses menu')
   await menu.click()
   await page.getByRole('link',{name:'Skip to main content',exact:true}).focus()
   await page.keyboard.press('Enter')
   assert.equal(await menu.getAttribute('aria-expanded'),'false')
  }
  if(mode==='after'){
   for(const nav of await page.locator('.section-navigation').all()){
    const active=nav.locator('[aria-current="page"]')
    if(await active.count()){
     const visible=await active.evaluate(e=>{const a=e.getBoundingClientRect(),b=e.parentElement.getBoundingClientRect();return a.left>=b.left&&a.right<=b.right})
     assert.equal(visible,true,`${name}: active section tab is visible`)
    }
   }
  }
  if(mode==='interactions'){
   await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight))
   const actions=page.getByRole('region',{name:name==='budget'?'Budget actions':'Annual target actions'})
   const back=actions.getByRole('button',{name:'Back to top',exact:true})
   await back.waitFor()
   // Portaling Back to top can wrap/grow the action area; remeasure at the new bottom.
   await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight))
   const boxes=await actions.getByRole('button').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}}))
   for(const box of boxes){assert.ok(box.x>=0&&box.x+box.w<=layout.width+1);assert.ok(box.y>=0&&box.y+box.h<=layout.height+1,'Action button clipped')}
   for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
    const a=boxes[i],b=boxes[j]
    assert.equal(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y,false,'Action buttons overlap')
   }
   const lastField=page.locator(name==='budget'?'.budget-amount-row input[type="number"]':'.yearly-target-row input[type="number"]').last()
   // Explicitly center the field: scrollIntoViewIfNeeded considers a field
   // behind a sticky header "in the viewport" and does not move it at all.
   await lastField.evaluate(e=>e.scrollIntoView({block:'center'}))
   const hit=await lastField.evaluate(e=>{const r=e.getBoundingClientRect(),target=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {reachable:e.contains(target),field:r.toJSON(),target:target?.outerHTML.slice(0,300)}})
   if(!hit.reachable){await page.screenshot({path:resolve(output,`${layout.name}-${name}-blocked.png`)});console.log(hit)}
   assert.ok(hit.reachable,'Last field remains reachable')
   const trigger=page.getByRole('button',{name:/Open calculator for/}).last()
   await trigger.click()
   await page.getByRole('button',{name:'Close calculator',exact:true}).waitFor()
   await page.keyboard.press('Escape')
   assert.ok(await trigger.evaluate(e=>e===document.activeElement))
  }
  await page.screenshot({path:resolve(output,`${layout.name}-${name}.png`)})
  if(layout.name==='desktop'&&mode==='after'&&['dashboard','review','budget'].includes(name)){
   const baseline=resolve(root,'artifacts/mobile-ui-qa/before',`desktop-${name}.png`)
   const a=await sharp(await readFile(baseline)).raw().toBuffer(),b=await sharp(resolve(output,`desktop-${name}.png`)).raw().toBuffer()
   assert.equal(Buffer.compare(a,b),0,`${name}: desktop screenshot changed`)
  }
  results.push({layout:layout.name,page:name})
  console.log(`${layout.name}: ${name}`)
  await context.close()
 }
 assert.deepEqual(errors,[])
 await writeFile(resolve(output,'results.json'),JSON.stringify(results,null,2))
 console.log(`${results.length} mobile/desktop layout cases passed`)
}finally{await browser?.close();await server.close()}
