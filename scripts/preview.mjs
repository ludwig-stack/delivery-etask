import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
if(!fs.existsSync(path.join(root,'dist/server/wrangler.json'))) throw new Error('Run npm run build first.');
// Wrangler resolves local secrets beside its generated config, not the checkout.
// Copy only for this explicitly local preview; builds never include secrets.
if(fs.existsSync(path.join(root,'.dev.vars'))) fs.copyFileSync(path.join(root,'.dev.vars'),path.join(root,'dist/server/.dev.vars'));
process.env.WRANGLER_SEND_METRICS='false';
const args=process.argv.slice(2);
const persistence=args.includes('--persist-to')?[]:['--persist-to','.wrangler/state'];
const child=spawn(process.execPath,['--import','./scripts/sites-env.mjs',path.join(root,'node_modules/wrangler/bin/wrangler.js'),'dev','--config',path.join(root,'dist/server/wrangler.json'),'--local',...persistence,'--ip','127.0.0.1','--inspector-port','0',...args],{cwd:root,stdio:'inherit',env:process.env});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code||0;});
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>child.kill(signal));
