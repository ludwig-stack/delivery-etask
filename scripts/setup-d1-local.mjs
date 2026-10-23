import fs from 'node:fs';
import crypto from 'node:crypto';
const envFile='.env.local',varsFile='.dev.vars';
const env=fs.existsSync(envFile)?fs.readFileSync(envFile,'utf8'):'';
const vars=fs.existsSync(varsFile)?fs.readFileSync(varsFile,'utf8'):'';
const value=(text,name)=>text.match(new RegExp(`^${name}=["']?([^"'\\r\\n]+)`, 'm'))?.[1];
const existingUrl=value(env,'D1_WORKER_URL');
if(existingUrl&&!['http://127.0.0.1:8787','http://localhost:8787'].includes(existingUrl)){
 console.log('Existing remote D1 configuration preserved; local database setup skipped.');
 process.exit(0);
}
const envSecret=value(env,'D1_WORKER_SECRET'),varsSecret=value(vars,'D1_WORKER_SECRET');
if(envSecret&&varsSecret&&envSecret!==varsSecret)throw new Error('Local D1 secrets differ in .env.local and .dev.vars. Reconcile them before starting.');
const secret=envSecret||varsSecret||crypto.randomBytes(48).toString('hex');
if(secret.length<32)throw new Error('D1_WORKER_SECRET must have at least 32 characters.');
if(!envSecret)fs.appendFileSync(envFile,`\nD1_WORKER_SECRET="${secret}"\n`,{mode:0o600});
if(!varsSecret)fs.appendFileSync(varsFile,`\nD1_WORKER_SECRET="${secret}"\n`,{mode:0o600});
if(!existingUrl)fs.appendFileSync(envFile,'\nD1_WORKER_URL=http://127.0.0.1:8787\n',{mode:0o600});
console.log('Local D1 connection prepared. Apply local migrations, then start npm run db:local alongside npm run dev.');
