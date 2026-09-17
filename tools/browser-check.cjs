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


 for(const width of [320,375,768,1024,1440]) {
  const page=await browser.newPage({viewport:{width,height:1100}});
  page.on('pageerror',e=>errors.push(e.message));
  let submission=null;
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin==='http://127.0.0.1:5179'){await route.continue();return;}
   requests.push(url.hostname);assert.equal(url.hostname,'netxgjqeaakbkjqvtdhl.supabase.co');
   const table=url.pathname.split('/').at(-1);let body=[];
   const vehicle={id:'30000000-0000-0000-0000-000000000001',fleet_id:'TRK-02',plate:'TRK-02',type:'BOX_TRUCK',status:'ACTIVE',route_id:null,current_driver_id:'20000000-0000-0000-0000-000000000001',custom_type:null,custom_description:null,color:null,distinguishing_marks:null,vin:null,engine_number:null,cubic_capacity_cc:null,seat_count:null,registration_category:null,purchased_on:null,purchase_price_minor:null,entered_service_on:null,expected_daily_amount_minor:0,yearly_target_minor:0,expected_retirement_on:null};
   if(table==='vehicles')body=url.searchParams.has('id')?vehicle:[vehicle];
   if(table==='drivers')body=[{id:'20000000-0000-0000-0000-000000000001',full_name:'Trip Driver',status:'ACTIVE'}];
   if(table==='record_trip'){submission=route.request().postDataJSON();body='40000000-0000-0000-0000-000000000001';}
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('http://127.0.0.1:5179/tools/browser-check.html?scene=trip-entry');
  await page.getByLabel('Fuel').waitFor();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Trip entry has no horizontal overflow at '+width);
  if(width===375){
   await page.getByLabel('Departed').fill('2026-09-10');
   await page.getByLabel('Revenue received').fill('10000000');
   await page.getByLabel('Checkpoint / road').fill('250000');
   await page.getByLabel('Fuel').fill('3250000');
   await page.getByLabel('Driver pay').fill('250000');
   await page.getByLabel('Helper pay').fill('250000');
   await page.getByRole('button',{name:'Done',exact:true}).click();
   await page.waitForFunction(()=>document.body.dataset.saved==='true');
   assert(submission,'Trip submission was captured');
   const costs=submission.p_expenses.reduce((sum,item)=>sum+item.amount_minor,0);
   assert.equal(submission.p_revenue_minor-costs,600000000,'Trip payload calculates SLE 6,000,000 net');
   assert.equal(submission.p_expenses.find(item=>item.category==='FUEL').amount_minor,325000000,'Fuel stored in minor units');
  }
  await page.close();
 }
 console.log('Trip entry passed Fuel payload and no-overflow checks at 320, 375, 768, 1024 and 1440px.');


 {
  const page=await browser.newPage({viewport:{width:375,height:1000}});
  page.on('pageerror',e=>errors.push(e.message));
  let fuelAdded=false;let addedPayload=null;
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin==='http://127.0.0.1:5179'){await route.continue();return;}
   requests.push(url.hostname);assert.equal(url.hostname,'netxgjqeaakbkjqvtdhl.supabase.co');
   const table=url.pathname.split('/').at(-1);let body=[];
   if(table==='trips')body={id:'40000000-0000-0000-0000-000000000001',vehicle_id:'30000000-0000-0000-0000-000000000001',driver_id:'20000000-0000-0000-0000-000000000001',helper_name:'Helper',pickup_location:'Freetown',destination_location:'Magburaka',departed_on:'2026-09-10',returned_on:'2026-09-11',load_quantity:100,load_weight:2000,load_weight_unit:'KG',status:'COMPLETED',notes:null,vehicles:{fleet_id:'TRK-02'}};
   if(table==='ledger_entries'){
    body=[
     {id:'income',direction:'INCOME',amount_minor:1000000000,category:'TRIP_REVENUE',note:null},
     {id:'road',direction:'EXPENSE',amount_minor:75000000,category:'ROAD_CHECKPOINT',note:null},
     ...(fuelAdded?[{id:'fuel',direction:'EXPENSE',amount_minor:325000000,category:'FUEL',note:null}]:[])
    ];
   }
   if(table==='add_trip_expense'){addedPayload=route.request().postDataJSON();fuelAdded=true;body='50000000-0000-0000-0000-000000000001';}
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('http://127.0.0.1:5179/tools/browser-check.html?scene=trip-detail');
  await page.getByText('SLE 9,250,000',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Add missing cost',exact:true}).click();
  await page.getByLabel('Amount').fill('3250000');
  await page.getByRole('button',{name:'Save cost',exact:true}).click();
  await page.getByText('SLE 6,000,000',{exact:true}).waitFor();
  assert.equal(addedPayload.p_category,'FUEL');
  assert.equal(addedPayload.p_amount_minor,325000000);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Trip detail has no horizontal overflow');
  await page.close();
 }
 console.log('Trip detail itemized costs and append-only Fuel correction recalculate the net to SLE 6,000,000.');


 {
  const page=await browser.newPage({viewport:{width:375,height:1200}});
  page.on('pageerror',e=>errors.push(e.message));
  let submission=null;
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin==='http://127.0.0.1:5179'){await route.continue();return;}
   requests.push(url.hostname);assert.equal(url.hostname,'netxgjqeaakbkjqvtdhl.supabase.co');
   const table=url.pathname.split('/').at(-1);let body=[];
   if(table==='vehicles')body=[{id:'30000000-0000-0000-0000-000000000001',fleet_id:'SPR-08',plate:null,type:'LONG_SPRINTER',status:'ACTIVE',route_id:null}];
   if(table==='create_maintenance_order'){submission=route.request().postDataJSON();body='60000000-0000-0000-0000-000000000001';}
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('http://127.0.0.1:5179/tools/browser-check.html?scene=maintenance');
  await page.getByRole('button',{name:'SPR-08',exact:true}).click();
  await page.getByRole('button',{name:'Regular Service',exact:true}).click();
  const areas=page.getByRole('combobox',{name:'Area'});
  await areas.nth(0).selectOption('OIL_CHANGE');
  await page.getByRole('button',{name:'+ Add another issue',exact:true}).click();
  await areas.nth(1).selectOption('Other');
  await page.getByLabel('Other area').fill('Battery terminal');
  await page.getByLabel('Work done (optional)').fill('Cleaned and tightened');
  await page.getByRole('button',{name:'+ Add another issue',exact:true}).click();
  assert.equal(await areas.count(),3,'Three issue cards can coexist');
  await page.getByRole('button',{name:'Remove',exact:true}).last().click();
  assert.equal(await areas.count(),2,'An issue can be removed');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Maintenance form has no horizontal overflow');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByText('Saved',{exact:true}).waitFor();
  assert(submission,'Maintenance submission was captured');
  assert.equal(submission.p_issues.length,2);
  assert.equal(submission.p_issues[0].service_area,'OIL_CHANGE');
  assert.equal(submission.p_issues[1].service_area,'Battery terminal');
  assert.equal(submission.p_issues[1].work_action,'Cleaned and tightened');
  await page.close();
 }
 console.log('Maintenance supports multiple ordered issues, Oil Change coexistence, custom areas, separate work details and removal.');

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
  if(scene==='vehicle'){
   await page.getByText('Adjusted completion',{exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Edit vehicle details',exact:true}).count(),1,'Vehicle profile has one details edit control');
  }
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
