import fs from 'node:fs';
import {getDatabase} from '../lib/runtime-node.ts';
if(fs.existsSync('.env.local')) process.loadEnvFile('.env.local');
if(process.env.VERCEL||process.env.CLOUDFLARE_D1_API_TOKEN||process.env.CLOUDFLARE_D1_DATABASE_ID||process.env.CLOUDFLARE_ACCOUNT_ID) throw new Error('This command initializes local SQLite only. Apply reviewed D1 migrations separately for a remote database.');
const db=await getDatabase();
const row=await db.prepare('SELECT COUNT(*) AS events FROM delivery_events').first();
console.log(`Local database ready. Preserved ${row?.events||0} delivery events.`);
