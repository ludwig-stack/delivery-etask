import fs from 'node:fs';
import {getStore} from '../lib/runtime-node.ts';
if(fs.existsSync('.env.local')) process.loadEnvFile('.env.local');
const store=getStore();
const data=await store.read();
console.log(`JSON database ready: ${store.file}. Preserved ${data.events.length} delivery events.`);
