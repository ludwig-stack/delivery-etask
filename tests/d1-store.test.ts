import {test,before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {D1HttpStore,StoreConflict,type EventRow} from '../lib/d1-store.ts';
import {startD1} from './helpers/d1-emulator.mjs';

let fixture:Awaited<ReturnType<typeof startD1>>;
let store:D1HttpStore;
before(async()=>{fixture=await startD1();store=new D1HttpStore(fixture.url,fixture.key);});
after(async()=>{await fixture?.close();});
beforeEach(async()=>{await fixture.db.batch([
 fixture.db.prepare('DELETE FROM delivery_events'),fixture.db.prepare('DELETE FROM auth_attempts'),fixture.db.prepare('UPDATE dsi_store_metadata SET revision=0,import_guard=0 WHERE id=1'),
]);});
const event=(version=1):EventRow=>({id:`e-${version}`,entity_type:'task',entity_id:'T0003',version,payload:'{"status":"Review","actual":0}',actor_id:'joey',actor_name:'Joey',at:'2026-10-23T00:00:00.000Z'});
const raw=(operation:string,body:unknown,key=fixture.key)=>fetch(`${fixture.url}/${operation}`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body)});

test('D1 persists original schema fields, full history, measured zero and blank values',async()=>{
 await store.commitEvent(()=>event());await store.commitEvent(()=>event(2));
 const reopened=new D1HttpStore(fixture.url,fixture.key);
 assert.deepEqual(await reopened.allEvents(),[event(),event(2)]);
 assert.equal(JSON.parse((await reopened.snapshot()).latest[0].payload).actual,0);
 assert.equal((await reopened.read()).revision,2);
 const columns=await fixture.db.prepare('PRAGMA table_info(delivery_events)').all();
 assert.deepEqual(columns.results.map((row:Record<string,unknown>)=>row.name),Object.keys(event()));
});
test('concurrent stale edits preserve one winner and return a conflict',async()=>{
 const results=await Promise.allSettled([store.commitEvent(()=>event()),store.commitEvent(()=>({...event(),id:'other'}))]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert(results.some(r=>r.status==='rejected'&&r.reason instanceof StoreConflict));
 assert.equal((await store.allEvents()).length,1);
});
test('revision check protects cross-record dependencies and database enforces version sequences',async()=>{
 await store.commitEvent(()=>event());
 assert.equal((await raw('commit',{revision:0,event:{...event(),id:'other',entity_id:'T0004'}})).status,409);
 assert.equal((await raw('commit',{revision:1,event:event(3)})).status,409);
 assert.deepEqual(await store.allEvents(),[event()]);
});
test('D1 batches enforce shared login limits using the database clock',async()=>{
 const allowed=await Promise.all(Array.from({length:12},()=>store.recordLoginAttempt('marco')));
 assert.equal(allowed.filter(Boolean).length,8);
 assert.equal(await store.recordLoginAttempt('other'),true);
 await fixture.db.prepare("UPDATE auth_attempts SET at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-16 minutes')").run();
 assert.equal(await store.recordLoginAttempt('marco'),true);
});
test('imports preserve metadata and all history and refuse a nonempty destination',async()=>{
 const data={schema:'dsi-json-store/1',revision:19,updatedAt:'2026-10-23T00:00:00.000Z',events:[event(),event(2)],loginAttempts:[{identifier:'marco',at:new Date().toISOString()}]};
 await store.importData(data);assert.deepEqual(await store.read(),{...data,schema:'dsi-d1-store/1'});
 await assert.rejects(store.importData(data),/empty D1 database/);
 assert.deepEqual(await store.read(),{...data,schema:'dsi-d1-store/1'});
});
test('login activity prevents importing over an active target',async()=>{
 await store.recordLoginAttempt('marco');await assert.rejects(store.restoreEvents([event()]),/empty D1 database/);
 assert.equal((await store.allEvents()).length,0);
});
test('failed imported SQL rolls back events and metadata',async()=>{
 const data={schema:'dsi-json-store/1',revision:1,updatedAt:'2026-10-23T00:00:00.000Z',events:[event(2)],loginAttempts:[]};
 const response=await raw('import',{data});assert.equal(response.status,400);
 assert.equal((await store.allEvents()).length,0);assert.equal((await store.read()).revision,0);
 // Exercise a real batch rollback after the guard and an insert succeeded.
 await assert.rejects(fixture.db.batch([
  fixture.db.prepare('UPDATE dsi_store_metadata SET import_guard=0 WHERE id=1'),
  fixture.db.prepare('INSERT INTO delivery_events (id,entity_type,entity_id,version,payload,actor_id,actor_name,at) VALUES (?,?,?,?,?,?,?,?)').bind(...Object.values(event())),
  fixture.db.prepare('UPDATE dsi_store_metadata SET revision=-1 WHERE id=1'),
 ]));
 assert.equal((await store.allEvents()).length,0);assert.equal((await store.read()).revision,0);
});
test('full-history export exceeds the usual 150 audit rows and preserves all versions',async()=>{
 const events=Array.from({length:1005},(_,i)=>event(i+1));await store.restoreEvents(events);
 assert.deepEqual(await store.allEvents(),events);assert.equal((await store.snapshot()).audit.length,150);
});
test('additive schema migration preserves existing baseline events and is repeatable',async()=>{
 await store.commitEvent(()=>event());
 // Simulate the baseline before the additive store migration was installed.
 await fixture.db.prepare('DROP TRIGGER dsi_event_revision').run();
 await fixture.db.prepare('DROP TRIGGER dsi_event_version').run();
 await fixture.db.prepare('DROP TABLE dsi_store_metadata').run();
 const start=fixture.migrations.findIndex(sql=>sql.includes('CREATE TABLE IF NOT EXISTS dsi_store_metadata'));
 for(const statement of fixture.migrations.slice(start))await fixture.db.prepare(statement).run();
 assert.deepEqual(await store.allEvents(),[event()]);assert.equal((await store.read()).revision,1);
});
test('database Worker rejects absent/wrong credentials, arbitrary paths and bad input',async()=>{
 assert.equal((await raw('read',{},'wrong')).status,401);
 assert.equal((await fetch(fixture.url+'/read',{method:'POST',body:'{}'})).status,401);
 assert.equal((await raw('query',{sql:'DELETE FROM delivery_events'})).status,404);
 assert.equal((await raw('login',{identifier:''})).status,400);
 assert.equal((await raw('commit',{revision:0,event:{}})).status,400);
 assert.equal((await raw('import',{data:'x'.repeat(5_000_000)})).status,413);
});
test('runtime rejects missing and unsafe configuration without a local fallback',async()=>{
 assert.throws(()=>new D1HttpStore('',''),/D1_WORKER_URL/);
 assert.throws(()=>new D1HttpStore('http://external.example',fixture.key),/HTTPS/);
 assert.throws(()=>new D1HttpStore(fixture.url,'short'),/32/);
 await assert.rejects(new D1HttpStore(fixture.url,'incorrect-secret-with-32-characters').read(),/rejected/);
 await fixture.db.prepare('DROP TABLE dsi_store_metadata').run();
 await assert.rejects(store.read(),/schema is missing/);
});
