const { chromium } = require(process.env.FLEET_PLAYWRIGHT_MODULE || require('node:path').join(require('node:os').homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 const errors=[]; const requests=[]; const submissions=[];
 for(const width of [320,375,768,1024,1440]) {
  const page=await browser.newPage({viewport:{width,height:1000}});
  page.on('pageerror',e=>{errors.push(e.message);console.error('Page:',e.message)});
  page.on('console',m=>{if(m.type()==='error') console.error('Console:',m.text())});
  await page.route('**/*',async route=>{
   if(route.request().url().startsWith('http://127.0.0.1:5179/')) { await route.continue(); return; }
   const url=new URL(route.request().url()); requests.push(url.hostname);
   assert.equal(url.hostname,'netxgjqeaakbkjqvtdhl.supabase.co','Only staging API may be requested');
   let body=[];
   if(url.pathname.endsWith('/rpc/freetown_today')) body='2026-09-08';
   else if(url.pathname.endsWith('/rpc/vehicle_purchase_payment_context'))body={underAgreement:true,deferred:true,dailyAmountMinor:50000};
   else if(url.pathname.endsWith('/rpc/record_daily_payment')){submissions.push(route.request().postDataJSON());body='10000000-0000-0000-0000-000000000001';}
   else if(url.pathname.endsWith('/vehicles')) {
    const v={id:'30000000-0000-0000-0000-000000000001',fleet_id:'TEST-01',type:'LONG_SPRINTER',status:'ACTIVE',route_id:null,current_driver_id:null,expected_daily_amount_minor:50000,purchase_price_minor:null,cubic_capacity_cc:null,seat_count:null,yearly_target_minor:0};
    body=url.searchParams.has('id')?v:[v];
   }
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('http://127.0.0.1:5179/tools/browser-check.html');
  await page.getByRole('button',{name:'TEST-01'}).waitFor({timeout:10000}).catch(async e=>{console.error(await page.locator('body').innerText());throw e});
  await page.getByRole('button',{name:'TEST-01'}).click();
  await page.getByRole('button',{name:'Service',exact:true}).click();
  await page.getByText('No payment is recorded for Service.',{exact:false}).waitFor();
  assert.equal(await page.getByRole('textbox').count(),0,'Service hides amount field');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
  await page.getByRole('button',{name:'Done',exact:true}).focus();
  if(width===320)await page.context().setOffline(true);
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.body.dataset.saved==='true');
  if(width===320){
   const queued=await page.evaluate(()=>window.testQueue.fetchPendingWrites());
   assert.equal(queued.length,1);assert.equal(queued[0].payload.dayOutcome,'SERVICE');assert.equal(queued[0].payload.receivedAmountMinor,0);
   await page.context().setOffline(false);
   await page.evaluate(()=>window.testQueue.flushOfflineQueue());
   assert.equal(submissions.at(-1).p_client_record_id,queued[0].clientRecordId);
   assert.equal((await page.evaluate(()=>window.testQueue.fetchPendingWrites())).length,0);
  }
  assert.equal(submissions.at(-1).p_received_amount_minor,0);
  assert.equal(submissions.at(-1).p_day_outcome,'SERVICE');
  if(width===375 && process.env.FLEET_BROWSER_SCREENSHOT) await page.screenshot({path:process.env.FLEET_BROWSER_SCREENSHOT,fullPage:true});
  await page.close();
 }

 for(const scene of ['vehicle','driver']) {
  const page=await browser.newPage({viewport:{width:1024,height:1000}});
  page.on('pageerror',e=>errors.push(e.message));
  let routeId='route-a'; let failed=false; const assignments=[];
  const vehicle={id:'30000000-0000-0000-0000-000000000001',fleet_id:'TEST-01',type:'LONG_SPRINTER',status:'ACTIVE',current_driver_id:null,expected_daily_amount_minor:50000,purchase_price_minor:null,cubic_capacity_cc:null,seat_count:null,yearly_target_minor:0};
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin==='http://127.0.0.1:5179'){await route.continue();return;}
   assert.equal(url.hostname,'netxgjqeaakbkjqvtdhl.supabase.co');
   const table=url.pathname.split('/').at(-1); let body=[];
   if(table==='vehicles') body=url.searchParams.has('id')?{...vehicle,route_id:routeId}:[{...vehicle,route_id:routeId}];
   if(table==='drivers'){const d={id:'20000000-0000-0000-0000-000000000001',full_name:'Test Driver',status:'ACTIVE'};body=url.searchParams.has('id')?d:[d];}
   if(table==='routes'){const routes=[{id:'route-a',name:'Route A'},{id:'route-b',name:'Route B'}];body=url.searchParams.has('id')?routes.find(r=>url.searchParams.get('id')==='eq.'+r.id):routes;}
   if(table==='corrections')body=null;
   if(table==='freetown_today')body='2026-09-08';
   if(table==='driver_purchase_agreements')body=scene==='driver'?[]:{id:'agreement',vehicle_id:vehicle.id,driver_id:'20000000-0000-0000-0000-000000000001',agreement_amount_minor:3000000,regular_payment_minor:50000,payment_frequency:'DAILY',started_on:'2026-09-01',expected_completion_on:'2026-11-01',ownership_transfer_status:'IN_PROGRESS',cancellation_reason:null};
   if(table==='driver_purchase_progress')body={paidMinor:25000,remainingMinor:2975000,originalCompletionOn:'2026-11-01',adjustedCompletionOn:'2026-11-06',remainingDays:59,adjustmentDays:5,missingDays:5,asOfDate:'2026-09-08',estimatedBaseline:false,policyEffectiveOn:'2026-09-01'};
   if(table==='assign_driver_to_vehicle'){
    const payload=route.request().postDataJSON();assignments.push(payload);
    if(!failed){failed=true;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Simulated retry'})});return;}
    routeId=payload.p_route_id;body='assignment';
   }
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body??null)});
  });
  await page.goto('http://127.0.0.1:5179/tools/browser-check.html?scene='+scene);
  if(scene==='vehicle')await page.getByText('Adjusted completion',{exact:true}).waitFor();
  await page.getByRole('button',{name:scene==='vehicle'?'Assign driver':'Assign to vehicle',exact:true}).click();
  const select=page.getByRole('combobox',{name:/Route \(optional\)/});
  await select.waitFor({timeout:10000}).catch(async e=>{console.error(scene,await page.locator('body').innerText(),errors);throw e});
  assert.equal(await select.inputValue(),'route-a','Default selected vehicle route');
  await select.selectOption(scene==='vehicle'?'route-b':'');
  await page.getByRole('button',{name:'Assign',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Could not assign'}).waitFor();
  await page.getByRole('button',{name:'Assign',exact:true}).click();
  await page.getByRole('button',{name:scene==='vehicle'?'Assign driver':'Assign to vehicle',exact:true}).waitFor();
  assert.equal(assignments.length,2);assert.equal(assignments[0].p_client_record_id,assignments[1].p_client_record_id,'Retry retains client ID');
  assert.equal(assignments[1].p_route_id,scene==='vehicle'?'route-b':null,'Route change and explicit None');
  if(scene==='vehicle')await page.getByText('Route B',{exact:true}).waitFor();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Profile no overflow');
  await page.close();
 }
 console.log('Both assignment forms passed route defaults, changes/None, stable retry IDs, and vehicle refresh; purchase progress rendered.');
 assert.deepEqual(errors,[]);
 console.log('Service browser checks passed at 320, 375, 768, 1024, 1440px; keyboard Done; zero payload; mocked staging-only requests.');
 await browser.close();
})().catch(e=>{console.error(e.message);process.exit(1)});
