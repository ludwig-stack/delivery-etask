import {spawn} from 'node:child_process';
import nextEnv from '@next/env';
import {startD1} from '../tests/helpers/d1-emulator.mjs';
nextEnv.loadEnvConfig(process.cwd(),true);
const fixture=await startD1({persistPath:'.data/stage-one-preview'});
const port=process.env.STAGE_ONE_PORT||'5173';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port',port],{env:{...process.env,STAGE_ONE_LOCAL_PREVIEW:'1',D1_WORKER_URL:fixture.url,D1_WORKER_SECRET:fixture.key},stdio:'inherit'});
console.log(`Stage 1 local preview: http://127.0.0.1:${port}. Uses a separate persistent local database; live team data is untouched.`);
let closing=false;
async function close(){if(closing)return;closing=true;server.kill();await fixture.close();}
process.on('SIGINT',()=>{void close();});process.on('SIGTERM',()=>{void close();});
server.on('exit',async code=>{await close();process.exitCode=code||0;});server.on('error',async error=>{console.error(error.message);await close();process.exitCode=1;});
