import nextEnv from '@next/env';
import {getStore} from '../lib/runtime-node.ts';
nextEnv.loadEnvConfig(process.cwd(),process.env.NODE_ENV!=='production');
const data=await getStore().read();
console.log(`Supabase connection and schema verified. ${data.events.length} delivery events; revision ${data.revision}.`);
