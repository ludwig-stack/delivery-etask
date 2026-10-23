import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createD1HttpDatabase} from '../lib/database.ts';
import {getDatabase} from '../lib/runtime-node.ts';
import {sameOrigin} from '../lib/request-origin.ts';
const config={accountId:'a'.repeat(32),databaseId:'12345678-1234-1234-1234-123456789abc',token:'test-server-only-token'};
test('origin checks use the incoming host and reject forged forwarding headers',()=>{
 assert(sameOrigin(new Request('http://localhost:5174/api/state',{headers:{Origin:'http://127.0.0.1:5174',Host:'127.0.0.1:5174'}})));
 assert(!sameOrigin(new Request('https://internal/api/state',{headers:{Origin:'https://untrusted.example',Host:'app.example','X-Forwarded-Host':'untrusted.example'}})));
 assert(!sameOrigin(new Request('https://app.example/api/state',{headers:{Origin:'http://app.example',Host:'app.example'}})));
 assert(!sameOrigin(new Request('https://app.example/api/state',{headers:{Host:'app.example'}})));
});
test('D1 HTTP adapter binds values and sends credentials only in the server request',async()=>{
 const db=createD1HttpDatabase(config,async(url,options)=>{
  assert.equal(String(url),`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`);
  assert.equal((options?.headers as Record<string,string>).Authorization,`Bearer ${config.token}`);
  assert.deepEqual(JSON.parse(String(options?.body)),{sql:'SELECT ? AS value',params:["quote' test"]});
  assert.equal(options?.cache,'no-store');
  return Response.json({success:true,result:[{success:true,results:[{value:"quote' test"}]}]});
 });
 assert.deepEqual(await db.prepare('SELECT ? AS value').bind("quote' test").first(),{value:"quote' test"});
});
test('D1 errors preserve version conflicts and hide provider details',async()=>{
 const conflict=createD1HttpDatabase(config,async()=>Response.json({success:false,errors:[{message:'UNIQUE constraint failed: delivery_entity_version'}]}));
 await assert.rejects(conflict.prepare('INSERT').run(),/UNIQUE record version conflict/);
 const failed=createD1HttpDatabase(config,async()=>Response.json({success:false,errors:[{message:'private provider message'}]},{status:403}));
 await assert.rejects(failed.prepare('SELECT').all(),error=>error instanceof Error&&error.message.includes('HTTP 403')&&!error.message.includes('private provider'));
});
test('Vercel refuses ephemeral storage when D1 is not configured',async()=>{
 const previous=process.env.VERCEL;process.env.VERCEL='1';
 try{await assert.rejects(getDatabase(),/Local SQLite is disabled on Vercel/);}finally{if(previous===undefined)delete process.env.VERCEL;else process.env.VERCEL=previous;}
});
test('Node SQLite adapter retains event versions and rejects duplicate writes',async()=>{
 const folder=fs.mkdtempSync(path.resolve('.data-test-'));
 const previous=process.env.DSI_SQLITE_PATH;process.env.DSI_SQLITE_PATH=path.join(folder,'tracker.sqlite');
 try{
  const db=await getDatabase();
  const insert=db.prepare('INSERT INTO delivery_events (id,entity_type,entity_id,version,payload,actor_id,actor_name,at) VALUES (?,?,?,?,?,?,?,?)');
  await insert.bind('event-1','task','T0003',1,'{"status":"Review"}','joey','Joey','2026-10-23T00:00:00.000Z').run();
  await assert.rejects(insert.bind('event-2','task','T0003',1,'{}','wyline','Wyline','2026-10-23T00:00:01.000Z').run(),/UNIQUE/);
  const row=await db.prepare('SELECT version,payload,actor_name FROM delivery_events WHERE id=?').bind('event-1').first<{version:number;payload:string;actor_name:string}>();
  assert.deepEqual({...row},{version:1,payload:'{"status":"Review"}',actor_name:'Joey'});
 }finally{if(previous===undefined)delete process.env.DSI_SQLITE_PATH;else process.env.DSI_SQLITE_PATH=previous;}
});
