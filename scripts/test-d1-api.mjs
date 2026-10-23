import {spawn} from 'node:child_process';
import crypto from 'node:crypto';
import nextEnv from '@next/env';
import {startD1} from '../tests/helpers/d1-emulator.mjs';
nextEnv.loadEnvConfig(process.cwd(),true);
const fixture=await startD1();
const base='http://127.0.0.1:5188';
const env={...process.env,NODE_ENV:'production',HOSTNAME:'127.0.0.1',PORT:'5188',D1_WORKER_URL:fixture.url,D1_WORKER_SECRET:fixture.key,DSI_TEST_URL:base};
const adminPassword=crypto.randomBytes(24).toString('base64url');
const salt=crypto.randomBytes(24).toString('hex');
env.AUTH_USERS_JSON=JSON.stringify([...JSON.parse(env.AUTH_USERS_JSON||'[]'),{id:'qa-admin',username:'qa-admin',name:'QA administrator',role:'admin',owner:'Joey',salt,passwordHash:crypto.pbkdf2Sync(adminPassword,salt,100000,32,'sha256').toString('hex')}]);
env.DSI_TEST_ADMIN_PASSWORD=adminPassword;
const server=spawn(process.execPath,['.next/standalone/server.js'],{env,stdio:['ignore','pipe','pipe']});
let output='',startupError;
server.stdout.on('data',chunk=>{output+=chunk;});server.stderr.on('data',chunk=>{output+=chunk;});
server.on('error',error=>{startupError=error;});
try{
 let ready=false;
 for(let i=0;i<100;i++){
  if(startupError)throw startupError;
  if(server.exitCode!==null)throw new Error('Isolated app exited before becoming ready. '+output);
  try{ready=(await fetch(base+'/login')).ok;}catch{}
  if(ready)break;
  await new Promise(resolve=>setTimeout(resolve,200));
 }
 if(!ready)throw new Error('Isolated app did not become ready. '+output);
 const code=await new Promise((resolve,reject)=>{
  const checks=spawn(process.execPath,['scripts/test-api.mjs'],{env,stdio:'inherit'});
  checks.on('error',reject);checks.on('exit',resolve);
 });
 if(code!==0)throw new Error(`D1 API checks failed (${code}). ${output}`);
}finally{
 server.kill();await fixture.close();
}
