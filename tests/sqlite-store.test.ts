import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {SqliteStore,StoreConflict,type EventRow} from '../lib/sqlite-store.ts';
async function location(){const dir=await fs.mkdtemp(path.resolve('.data-test-'));return path.join(dir,'delivery.sqlite');}
const event=(version=1):EventRow=>({id:`event-${version}`,entity_type:'task',entity_id:'T0003',version,payload:JSON.stringify({status:'Review',actual:0}),actor_id:'joey',actor_name:'Joey',at:'2026-10-23T00:00:00.000Z'});
test('SQLite data and measured zero survive reopening the database',async()=>{
 const file=await location(),store=new SqliteStore(file);await store.commitEvent(()=>event());
 const reopened=new SqliteStore(file),snapshot=await reopened.snapshot();
 assert.equal(snapshot.latest[0].version,1);assert.equal(JSON.parse(snapshot.latest[0].payload).actual,0);
 assert.equal((await reopened.read()).schema,'dsi-sqlite-store/1');
});
test('simultaneous edits produce one success and one conflict',async()=>{
 const file=await location();
 const results=await Promise.allSettled([new SqliteStore(file).commitEvent(()=>event()),new SqliteStore(file).commitEvent(()=>({...event(),id:'other'}))]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert(results.some(r=>r.status==='rejected'&&r.reason instanceof StoreConflict));
 assert.equal((await new SqliteStore(file).allEvents()).length,1);
});
test('independent Node processes preserve every write through the SQLite transactions',async()=>{
 const file=await location(),run=promisify(execFile);
 await Promise.all([run(process.execPath,['--experimental-strip-types','tests/helpers/sqlite-writer.mjs',file]),run(process.execPath,['--experimental-strip-types','tests/helpers/sqlite-writer.mjs',file])]);
 const rows=await new SqliteStore(file).allEvents();assert.equal(rows.length,10);assert.deepEqual(rows.map(e=>e.version),[1,2,3,4,5,6,7,8,9,10]);
});
test('concurrent login attempts enforce and persist the eight-attempt limit',async()=>{
 const file=await location();
 const results=await Promise.all(Array.from({length:12},()=>new SqliteStore(file).recordLoginAttempt('marco')));
 assert.equal(results.filter(Boolean).length,8);assert.equal((await new SqliteStore(file).read()).loginAttempts.length,8);
 assert.equal(await new SqliteStore(file).recordLoginAttempt('marco',new Date(Date.now()+16*60*1000)),true);
});
test('corrupt data is preserved instead of being reset or overwritten',async()=>{
 const file=await location(),raw='{broken';await fs.writeFile(file,raw);
 await assert.rejects(new SqliteStore(file).commitEvent(()=>event()),/contents were preserved/);
 assert.equal(await fs.readFile(file,'utf8'),raw);
});
test('full event restore retains versions and refuses existing destinations',async()=>{
 const file=await location(),store=new SqliteStore(file);await store.restoreEvents([event(1),event(2)]);
 assert.deepEqual(await store.allEvents(),[event(1),event(2)]);
 await assert.rejects(store.restoreEvents([]),/existing data was preserved/);
 const invalid=new SqliteStore(await location());await assert.rejects(invalid.restoreEvents([event(2)]),/Incomplete/);
});

test('JSON migration preserves the complete history, revision, timestamps and login limits',async()=>{
 const file=await location(),store=new SqliteStore(file);
 const legacy={schema:'dsi-json-store/1',revision:19,updatedAt:'2026-10-23T00:00:00.000Z',events:[event(1),event(2)],loginAttempts:Array.from({length:8},()=>({identifier:'marco',at:new Date().toISOString()}))};
 const original=JSON.stringify(legacy),input=file+'.json';await fs.writeFile(input,original);
 await promisify(execFile)(process.execPath,['--experimental-strip-types','scripts/migrate-json.mjs',input,file]);
 assert.deepEqual(await store.read(),{...legacy,schema:'dsi-sqlite-store/1'});
 assert.equal(await store.recordLoginAttempt('marco'),false);
 assert.equal(await fs.readFile(input,'utf8'),original);
 const before=await fs.readFile(file);
 await assert.rejects(store.importJson(legacy),/existing data was preserved/);
 assert.deepEqual(await fs.readFile(file),before);
});

test('failed business validation rolls back and a later write succeeds',async()=>{
 const store=new SqliteStore(await location());await store.commitEvent(()=>event());
 await assert.rejects(store.commitEvent(()=>{throw new Error('Rejected change');}),/Rejected change/);
 await assert.rejects(store.commitEvent(()=>({...event(2),payload:'not json'})));
 assert.equal((await store.read()).revision,1);
 await store.commitEvent(()=>event(2));assert.equal((await store.read()).revision,2);
});

test('SQLite releases a crashed writer and rolls back its incomplete transaction',async()=>{
 const file=await location(),store=new SqliteStore(file);await store.commitEvent(()=>event());
 const code=`import {DatabaseSync} from 'node:sqlite';const db=new DatabaseSync(process.argv[1]);db.exec("BEGIN IMMEDIATE; DELETE FROM events;");process.exit(0);`;
 await promisify(execFile)(process.execPath,['--input-type=module','-e',code,file]);
 assert.deepEqual(await store.allEvents(),[event()]);
 await store.commitEvent(()=>event(2));assert.equal((await store.allEvents()).length,2);
});

test('SQLite writer locks time out without losing existing records',async()=>{
 const file=await location(),store=new SqliteStore(file,25);await store.commitEvent(()=>event());
 const db=new DatabaseSync(file);db.exec('BEGIN IMMEDIATE');
 try{await assert.rejects(store.commitEvent(()=>event(2)),/locked|busy/);}
 finally{db.exec('ROLLBACK');db.close();}
 assert.deepEqual(await store.allEvents(),[event()]);
});
