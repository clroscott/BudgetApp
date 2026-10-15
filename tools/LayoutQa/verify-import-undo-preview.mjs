import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {dirname,resolve} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {responseFor,importId} from './fixtures.mjs'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),client=resolve(root,'BudgetApp/budgetapp.client')
const require=createRequire(resolve(client,'package.json'))
const {createServer}=await import(pathToFileURL(require.resolve('vite')).href)
const react=(await import(pathToFileURL(require.resolve('@vitejs/plugin-react')).href)).default
const {chromium}=await import(process.env.BUDGETAPP_QA_PLAYWRIGHT_PATH?pathToFileURL(process.env.BUDGETAPP_QA_PLAYWRIGHT_PATH).href:'playwright')
const output=resolve(root,'artifacts/import-undo-preview-qa')
await mkdir(output,{recursive:true})
const server=await createServer({root:client,configFile:false,plugins:[react()],server:{host:'127.0.0.1',port:4192,strictPort:true}})
let browser
const errors=[],results=[]
try{
 await server.listen()
 browser=await chromium.launch({headless:true,...(process.env.BUDGETAPP_QA_BROWSER_PATH?{executablePath:process.env.BUDGETAPP_QA_BROWSER_PATH}:{})})
 for(const width of [1440,390,320])for(const scenario of ['eligible','blocked','failed-read','lost-response','viewer']){
  const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<500,reducedMotion:'reduce'})
  const page=await context.newPage()
  let reads=0,writes=0,reversed=false,allowRetry=false
  page.on('dialog',dialog=>dialog.accept())
  page.on('pageerror',error=>errors.push(error.message))
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url())
   if(url.origin!=='http://127.0.0.1:4192'){errors.push('External request blocked');return route.abort()}
   if(!url.pathname.startsWith('/api/'))return route.continue()
   if(url.pathname==='/api/auth/antiforgery')return route.fulfill({json:{token:'synthetic-qa-only'}})
   if(request.method()==='POST'&&url.pathname.endsWith('/reverse')){
    writes++;assert.equal(request.postDataJSON().confirmed,true);assert.equal(request.postDataJSON().previewVersion,'A'.repeat(64));reversed=true
    if(scenario==='lost-response')return route.abort()
    return route.fulfill({json:{importFileId:importId,status:'Reversed',reversedTransactionCount:3,updatedAtUtc:'2026-10-16T12:00:00Z',alreadyReversed:false}})
   }
   if(request.method()!=='GET'){errors.push(`Unexpected write blocked: ${url.pathname}`);return route.abort()}
   try{
    if(url.pathname.endsWith('/reversal-preview')){
     reads++
     if(scenario==='failed-read'&&!allowRetry)return route.fulfill({status:503,json:{title:'Synthetic unavailable preview',detail:'Try the read again.'}})
     const items=Array.from({length:3},(_,i)=>({draftId:`row-${i}`,sourceRowNumber:i+2,transactionId:`tx-${i}`,transactionDate:'2026-10-01',amount:i===0?-2.3456:12.3456,
      description:`Synthetic purchase ${i+1}`,draftUpdatedAtUtc:'2026-10-15T12:00:00Z',transactionUpdatedAtUtc:'2026-10-15T12:00:00Z',
      isEligible:scenario!=='blocked'||i!==0,blockingReasons:scenario==='blocked'&&i===0?['This transaction was changed after import approval.']:[]}))
     return route.fulfill({json:{previewVersion:'A'.repeat(64),status:reversed?'Reversed':'Completed',importFileId:importId,originalFileName:'sample-layout.xlsx',accountName:'Sample chequing',currency:'CAD',sourceWorksheetName:'Transactions',
      importUpdatedAtUtc:'2026-10-15T12:00:00Z',checkedAtUtc:'2026-10-15T13:00:00Z',canReverse:!reversed&&scenario!=='blocked',linkedTransactionCount:3,
      eligibleRowCount:scenario==='blocked'?2:3,blockedRowCount:scenario==='blocked'?1:0,blockingReasons:scenario==='blocked'?['The entire batch is blocked; no partial undo.']:[],items,page:1,pageSize:100,totalCount:3,totalPages:1}})
    }
    let data=responseFor(url.pathname,{mfa:true})
    if(url.pathname.endsWith('/imports'))data={...data,items:data.items.map(item=>({...item,status:reversed?'Reversed':'Completed',approvedRows:30,canEdit:scenario!=='viewer'}))}
    if(url.pathname.endsWith('/drafts'))data={...data,summary:{...data.summary,status:reversed?'Reversed':'Completed',canEdit:scenario!=='viewer',counts:{...data.summary.counts,pendingRows:0,approvedRows:30}},
     items:data.items.map((row,i)=>({...row,reviewDecision:'Approved',approvedTransactionId:`tx-${i}`}))}
    return route.fulfill({json:data})
   }catch(error){errors.push(error.message);return route.abort()}
  })
  await page.goto(`http://127.0.0.1:4192/imports/review?importId=${importId}`)
  await page.getByRole('heading',{name:'Review transactions in sample-layout.xlsx',exact:true}).waitFor()
  const trigger=page.getByRole('button',{name:'Preview undo',exact:true})
  if(scenario==='viewer'){assert.equal(await trigger.count(),0);assert.equal(reads,0)}
  else{
   await trigger.click()
   if(scenario==='failed-read'){
    const retry=page.getByRole('button',{name:'Retry loading',exact:true})
    await retry.waitFor();allowRetry=true;await retry.click()
   }
   await page.getByText('Synthetic purchase 1',{exact:true}).waitFor()
   assert.equal(await page.getByRole('button',{name:'Undo import',exact:true}).count(),scenario==='blocked'?0:1)
   assert.ok(await page.getByText('Checking this preview changes nothing. Undo voids the whole batch and keeps its history.',{exact:true}).isVisible())
   if(scenario==='blocked')assert.ok(await page.getByText('This transaction was changed after import approval.',{exact:true}).isVisible())
   await page.locator('.import-reversal-preview').screenshot({path:resolve(output,`${width}-${scenario}.png`)})
   const lane=page.getByRole('region',{name:'Undo preview rows',exact:true})
   if(width<500){assert.ok(await lane.evaluate(e=>e.scrollWidth>e.clientWidth));await lane.evaluate(e=>e.scrollLeft=e.scrollWidth);assert.ok(await lane.evaluate(e=>e.scrollLeft>0))}
   if(scenario==='blocked'){
    await page.getByRole('button',{name:'Close undo preview',exact:true}).click()
    assert.equal(writes,0)
   }else{
    await page.getByRole('button',{name:'Undo import',exact:true}).click()
    if(scenario==='lost-response'){
     await page.getByText('Refresh the undo preview to check the saved status before trying again.',{exact:true}).waitFor()
     assert.ok(await page.getByRole('button',{name:'Undo import',exact:true}).isDisabled())
     await page.getByRole('button',{name:'Refresh data',exact:true}).click()
     await page.getByText('Import undone. 3 transactions were voided; original history was retained.',{exact:true}).waitFor()
    }else{
     await page.getByText('Import undone. 3 transactions were voided; original history was retained.',{exact:true}).waitFor()
     await page.getByRole('button',{name:'Refresh selected import',exact:true}).click()
     await page.getByText(/This import was undone\. Its transactions are voided/).waitFor()
    }
    assert.equal(writes,1)
    assert.equal(await page.getByRole('button',{name:'Undo import',exact:true}).count(),0)
   }
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}/${scenario}: page-wide overflow`)
  results.push({width,scenario,reads,writes})
  console.log(`${width}px: ${scenario}`)
  await context.close()
 }
 assert.deepEqual(errors,[])
 await writeFile(resolve(output,'results.json'),JSON.stringify(results,null,2))
 console.log(`${results.length} synthetic confirmed-undo browser cases passed; all writes intercepted, no database used`)
}finally{await browser?.close();await server.close()}
