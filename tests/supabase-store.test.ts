import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {SupabaseStore,StoreConflict,type EventRow} from '../lib/supabase-store.ts';
import {startSupabase} from './helpers/supabase-emulator.mjs';

let fixture:Awaited<ReturnType<typeof startSupabase>>;
let store:SupabaseStore;
before(async()=>{fixture=await startSupabase();store=new SupabaseStore(fixture.url,fixture.key);});
after(async()=>{await fixture?.close();});
beforeEach(async()=>{await fixture.db.exec('TRUNCATE dsi_private.events RESTART IDENTITY; TRUNCATE dsi_private.login_attempts; UPDATE dsi_private.store_metadata SET revision=0;');});
const event=(version=1):EventRow=>({id:`e-${version}`,entity_type:'task',entity_id:'T0003',version,payload:'{"status":"Review","actual":0}',actor_id:'joey',actor_name:'Joey',at:'2026-10-23T00:00:00.000Z'});
const raw=async(name:string,body:Record<string,unknown>)=>fetch(`${fixture.url}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:fixture.key,'Content-Type':'application/json'},body:JSON.stringify(body)});

test('Supabase saves complete event history and preserves measured zero',async()=>{
 await store.commitEvent(()=>event());await store.commitEvent(()=>event(2));
 const reopened=new SupabaseStore(fixture.url,fixture.key),snapshot=await reopened.snapshot();
 assert.equal(JSON.parse(snapshot.latest[0].payload).actual,0);
 assert.deepEqual(await reopened.allEvents(),[event(),event(2)]);
 assert.equal((await reopened.read()).revision,2);
 assert.equal(fixture.requests.at(-1)?.authorization,undefined,'New secret keys must not be sent as bearer JWTs');
});

test('concurrent stale edits return one conflict and preserve the winning event',async()=>{
 const results=await Promise.allSettled([store.commitEvent(()=>event()),new SupabaseStore(fixture.url,fixture.key).commitEvent(()=>({...event(),id:'other'}))]);
 assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
 assert(results.some(result=>result.status==='rejected'&&result.reason instanceof StoreConflict));
 assert.equal((await store.allEvents()).length,1);
});

test('global revision rejects a commit validated before another dependency changed',async()=>{
 await store.commitEvent(()=>event());
 const response=await raw('dsi_commit_event',{p_revision:0,p_event:{...event(),id:'another',entity_id:'T0004'}});
 assert.equal((await response.json() as {code:string}).code,'40001');assert.equal((await store.allEvents()).length,1);
});

test('database transactions enforce login limits across separate requests and expire old attempts',async()=>{
 const attempts=await Promise.all(Array.from({length:12},()=>new SupabaseStore(fixture.url,fixture.key).recordLoginAttempt('marco')));
 assert.equal(attempts.filter(Boolean).length,8);
 assert.equal(await store.recordLoginAttempt('other'),true);
 await fixture.db.exec("UPDATE dsi_private.login_attempts SET at=(now()-interval '16 minutes')::text");
 assert.equal(await store.recordLoginAttempt('marco'),true);
});

test('import preserves history and metadata and refuses any existing target data',async()=>{
 const data={schema:'dsi-json-store/1',revision:19,updatedAt:'2026-10-23T00:00:00.000Z',events:[event(),event(2)],loginAttempts:[{identifier:'marco',at:new Date().toISOString()}]};
 await store.importData(data);
 assert.deepEqual(await store.read(),{...data,schema:'dsi-supabase-store/1'});
 await assert.rejects(store.importData(data),/empty Supabase database/);
 assert.deepEqual(await store.read(),{...data,schema:'dsi-supabase-store/1'});
});

test('database rejects an incomplete imported sequence and rolls back all its rows',async()=>{
 const response=await raw('dsi_import_store',{p_data:{schema:'dsi-json-store/1',revision:1,updatedAt:new Date().toISOString(),events:[event(2)],loginAttempts:[]}});
 assert.equal(response.status,400);assert.equal((await store.allEvents()).length,0);
 assert.equal((await store.read()).revision,0);
 await store.restoreEvents([event()]);assert.deepEqual(await store.allEvents(),[event()]);
});

test('browser roles cannot read private tables or execute database functions',async()=>{
 for(const role of ['anon','authenticated']){
  await assert.rejects(fixture.db.transaction(async tx=>{await tx.exec(`SET LOCAL ROLE ${role}`);await tx.query('SELECT public.dsi_read_store()');}),/permission denied/);
  await assert.rejects(fixture.db.transaction(async tx=>{await tx.exec(`SET LOCAL ROLE ${role}`);await tx.query('SELECT * FROM dsi_private.events');}),/permission denied/);
 }
});

test('RPC history exports are complete beyond the usual REST row limit',async()=>{
 const events=Array.from({length:1005},(_,i)=>event(i+1));await store.restoreEvents(events);
 assert.deepEqual(await store.allEvents(),events);
});

test('schema migration can be reapplied without changing event history',async()=>{
 await store.commitEvent(()=>event());await fixture.db.exec(fixture.migration);
 assert.deepEqual(await store.allEvents(),[event()]);
});

test('invalid server configuration fails before any database request',()=>{
 assert.throws(()=>new SupabaseStore('',''),/SUPABASE_URL/);
 assert.throws(()=>new SupabaseStore('https://example.supabase.co','sb_publishable_test'),/publishable/);
 assert.throws(()=>new SupabaseStore('http://external.example','sb_secret_test'),/HTTPS/);
});

test('rejected credentials and missing schema produce safe errors without a local fallback',async t=>{
 await assert.rejects(new SupabaseStore(fixture.url,'sb_secret_invalid').read(),/rejected the server credentials/);
 t.mock.method(globalThis,'fetch',async()=>Response.json({code:'PGRST202',message:'internal details'},{status:404}));
 await assert.rejects(store.read(),/schema is missing/);
});
