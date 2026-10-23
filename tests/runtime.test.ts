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
test('Vercel cannot silently use an ephemeral SQLite database',()=>{
 const old=process.env.VERCEL;process.env.VERCEL='1';
 try{assert.throws(getStore,/persistent Node server/);}finally{if(old===undefined)delete process.env.VERCEL;else process.env.VERCEL=old;}
});
test('database files cannot be configured inside publicly served assets',()=>{
 const old=process.env.DSI_DATA_PATH;process.env.DSI_DATA_PATH='public/private.sqlite';
 try{assert.throws(getStore,/outside public/);}finally{if(old===undefined)delete process.env.DSI_DATA_PATH;else process.env.DSI_DATA_PATH=old;}
});
