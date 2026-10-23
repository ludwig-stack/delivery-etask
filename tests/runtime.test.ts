import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sameOrigin} from '../lib/request-origin.ts';
import {getStore} from '../lib/runtime-node.ts';
test('origin checks use the actual host and reject forged forwarding headers',()=>{
 assert(sameOrigin(new Request('http://localhost:5174/api/state',{headers:{Origin:'http://127.0.0.1:5174',Host:'127.0.0.1:5174'}})));
 assert(!sameOrigin(new Request('https://internal/api/state',{headers:{Origin:'https://untrusted.example',Host:'app.example','X-Forwarded-Host':'untrusted.example'}})));
 assert(!sameOrigin(new Request('https://app.example/api/state',{headers:{Origin:'http://app.example',Host:'app.example'}})));
 assert(!sameOrigin(new Request('https://app.example/api/state',{headers:{Host:'app.example'}})));
});
test('D1 works on Vercel without a writable local database',()=>{
 const keys=['VERCEL','D1_WORKER_URL','D1_WORKER_SECRET'];
 const old=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 try{
  process.env.VERCEL='1';process.env.D1_WORKER_URL='https://delivery-etask-database.example.workers.dev';process.env.D1_WORKER_SECRET='test-secret-with-at-least-32-characters';
  assert.doesNotThrow(getStore);
  delete process.env.D1_WORKER_SECRET;
  assert.throws(getStore,/D1_WORKER_SECRET/);
 }finally{for(const key of keys){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];}}
});
