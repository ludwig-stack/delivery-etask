import fs from 'node:fs';
import assert from 'node:assert/strict';
const base=process.env.DSI_TEST_URL||'http://127.0.0.1:5174';
assert(new URL(base).hostname==='127.0.0.1','API checks are restricted to the isolated loopback preview.');
const accounts=fs.readFileSync('.local-accounts.txt','utf8');
const plan=JSON.parse(fs.readFileSync('app/data/plan.json','utf8'));
let checks=0;
async function call(path,{cookie,body,origin=base,headers={},method=body?'POST':'GET'}={}) {
 return fetch(base+path,{method,redirect:'manual',headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json',Origin:origin}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
}
async function expect(response,status,label) {assert.equal(response.status,status,`${label}: ${await response.clone().text()}`);checks++;return response;}
async function login(id) {
 const line=accounts.split('\n').find(l=>l.includes(`: ${id}@local.test / `));assert(line);
 const password=line.split(' / ')[1].trim();
 const res=await call('/api/auth/login',{body:{email:`${id}@local.test`,password}});
 await expect(res,200,`Login ${id}`);return res.headers.get('set-cookie').split(';')[0];
}
await expect(await call('/api/state'),401,'Anonymous API');
await expect(await call('/'),307,'Protected page');
await expect(await call('/api/state',{headers:{'oai-authenticated-user-id':'spoof','oai-authenticated-user-email':'wyline@local.test'}}),401,'Header spoof rejected');
await expect(await call('/api/downloads/DSI_Core_Tasks_494.csv'),401,'Protected download');
const staff=await login('joey'),reviewer=await login('wyline'),delegate=await login('reviewer'),viewer=await login('viewer');
const state=await (await call('/api/state',{cookie:reviewer})).json();
assert.equal(state.audit.length,0,'Start with a fresh isolated QA database.');
const task=plan.tasks.find(t=>t.owner==='Joey'&&!t.dependencies?.length);
const data={status:'Review',actual:task.target,evidence:'QA-only evidence: approved-output-1',blocker:'',rescueOwner:'',recoveryDate:'',acceptedBy:'Wyline',notes:'Isolated local acceptance test.'};
const update={entityType:'task',entityId:task.id,version:0,data};
const saved=await expect(await call('/api/state',{cookie:staff,body:update}),200,'Staff evidence submission');
assert.equal((await saved.json()).value.acceptedBy,'','Staff cannot record reviewer identity');
await expect(await call('/api/state',{cookie:staff,body:{...update,version:1,data:{...data,status:'Accepted'}}}),403,'Staff acceptance denied');
await expect(await call('/api/state',{cookie:staff,body:{...update,entityId:plan.tasks.find(t=>t.owner==='Wyline').id}}),403,'Other owner denied');
await expect(await call('/api/state',{cookie:reviewer,body:{...update,version:0}}),409,'Stale edit conflict');
await expect(await call('/api/state',{cookie:viewer,body:update}),403,'Viewer write denied');
const crossOrigin=await call('/api/state',{cookie:reviewer,body:update,origin:'https://untrusted.example'});
// This Vinext/Wrangler preview can reject the request before invoking the API.
assert([403,503].includes(crossOrigin.status),'Cross-origin updates must be rejected');checks++;
await expect(await call('/api/state',{cookie:reviewer,body:{...update,entityId:'T0495'}}),404,'Inactive support denied');
const accepted=await expect(await call('/api/state',{cookie:reviewer,body:{...update,version:1,data:{...data,status:'Accepted',acceptedBy:'Impersonated'}}}),200,'Reviewer acceptance');
const acceptedValue=(await accepted.json()).value;
assert.equal(acceptedValue.acceptedBy,'Wyline');assert(acceptedValue.closedAt);
await expect(await call('/api/state',{cookie:staff,body:{...update,version:2}}),403,'Staff cannot reopen acceptance');
const own=plan.tasks.find(t=>t.owner==='Wyline'&&!t.dependencies?.length);
await expect(await call('/api/state',{cookie:reviewer,body:{...update,entityId:own.id,data:{...data,status:'Accepted'}}}),403,'Self-acceptance denied');
await expect(await call('/api/state',{cookie:delegate,body:{entityType:'milestone',entityId:'M02',version:0,data:{...data,status:'Accepted'}}}),400,'Gate needs independent prerequisites');
await expect(await call('/api/state',{cookie:staff,body:{entityType:'metrics',entityId:task.date,version:0,data:{booked:0,evidence:'QA-only report'}}}),403,'Staff metric permission');
await expect(await call('/api/state',{cookie:reviewer,body:{entityType:'metrics',entityId:task.date,version:0,data:{booked:1,referralBookings:1,linkedinBookings:1,evidence:'QA-only report'}}}),400,'Attribution cannot double count');
await expect(await call('/api/state',{cookie:reviewer,body:{entityType:'metrics',entityId:task.date,version:0,data:{booked:0,held:'',evidence:'QA-only report'}}}),200,'Measured zero saved');
const current=await (await call('/api/state',{cookie:viewer})).json();
assert.equal(current.overrides[task.id].status,'Accepted');assert.equal(current.metrics[task.date].booked,0);assert.equal(current.metrics[task.date].held,null);
const csv=await expect(await call('/api/downloads/DSI_Core_Tasks_494.csv',{cookie:staff}),200,'Current CSV download');assert((await csv.text()).includes('21:45'));
await expect(await call('/api/backup',{cookie:staff}),403,'Backup restricted');
const backup=await expect(await call('/api/backup',{cookie:reviewer}),200,'Full event backup');
const full=await backup.json();assert.equal(full.events.length,3);
fs.mkdirSync('.handoff',{recursive:true});fs.writeFileSync('.handoff/qa-backup.json',JSON.stringify(full,null,2));
console.log(`Passed ${checks} API checks. Evidence persisted across separate account sessions. Full history: ${full.events.length} events.`);
