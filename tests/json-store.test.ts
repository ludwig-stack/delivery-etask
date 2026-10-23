import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {JsonStore,StoreConflict,type EventRow} from '../lib/json-store.ts';
async function location(){const dir=await fs.mkdtemp(path.resolve('.data-test-'));return path.join(dir,'delivery.json');}
const event=(version=1):EventRow=>({id:`event-${version}`,entity_type:'task',entity_id:'T0003',version,payload:JSON.stringify({status:'Review',actual:0}),actor_id:'joey',actor_name:'Joey',at:'2026-10-23T00:00:00.000Z'});
test('JSON data and measured zero survive reopening the database',async()=>{
 const file=await location(),store=new JsonStore(file);await store.commitEvent(()=>event());
 const reopened=new JsonStore(file),snapshot=await reopened.snapshot();
 assert.equal(snapshot.latest[0].version,1);assert.equal(JSON.parse(snapshot.latest[0].payload).actual,0);
 assert.equal((await reopened.read()).schema,'dsi-json-store/1');
});
test('simultaneous edits produce one success and one conflict',async()=>{
 const file=await location();
 const results=await Promise.allSettled([new JsonStore(file).commitEvent(()=>event()),new JsonStore(file).commitEvent(()=>({...event(),id:'other'}))]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert(results.some(r=>r.status==='rejected'&&r.reason instanceof StoreConflict));
 assert.equal((await new JsonStore(file).allEvents()).length,1);
});
test('independent Node processes preserve every write through the shared file lock',async()=>{
 const file=await location(),run=promisify(execFile);
 await Promise.all([run(process.execPath,['--experimental-strip-types','tests/helpers/json-writer.mjs',file]),run(process.execPath,['--experimental-strip-types','tests/helpers/json-writer.mjs',file])]);
 const rows=await new JsonStore(file).allEvents();assert.equal(rows.length,10);assert.deepEqual(rows.map(e=>e.version),[1,2,3,4,5,6,7,8,9,10]);
});
test('concurrent login attempts enforce and persist the eight-attempt limit',async()=>{
 const file=await location();
 const results=await Promise.all(Array.from({length:12},()=>new JsonStore(file).recordLoginAttempt('marco')));
 assert.equal(results.filter(Boolean).length,8);assert.equal((await new JsonStore(file).read()).loginAttempts.length,8);
 assert.equal(await new JsonStore(file).recordLoginAttempt('marco',new Date(Date.now()+16*60*1000)),true);
});
test('corrupt data is preserved instead of being reset or overwritten',async()=>{
 const file=await location(),raw='{broken';await fs.writeFile(file,raw);
 await assert.rejects(new JsonStore(file).commitEvent(()=>event()),/contents were preserved/);
 assert.equal(await fs.readFile(file,'utf8'),raw);
});
test('full event restore retains versions and refuses existing destinations',async()=>{
 const file=await location(),store=new JsonStore(file);await store.restoreEvents([event(1),event(2)]);
 assert.deepEqual(await store.allEvents(),[event(1),event(2)]);
 await assert.rejects(store.restoreEvents([]),/existing data was preserved/);
 const invalid=new JsonStore(await location());await assert.rejects(invalid.restoreEvents([event(2)]),/Incomplete/);
});
test('a lock left by another process fails closed without stealing ownership',async()=>{
 const file=await location(),lock=file+'.lock',owner='{"pid":1,"token":"other"}';await fs.writeFile(lock,owner);
 await assert.rejects(new JsonStore(file,50).commitEvent(()=>event()),/database is busy/);
 assert.equal(await fs.readFile(lock,'utf8'),owner);
});
