import fs from 'node:fs/promises';
if(process.env.VERCEL){
 console.log('Vercel packages the deployment; standalone server preparation is skipped.');
 process.exit(0);
}
for(const name of await fs.readdir('.next/standalone')){
 if(name.startsWith('.env')||name.startsWith('.dev.vars')||['.handoff','.data','.local-accounts.txt'].includes(name))throw new Error(`Private runtime configuration was included in the build: ${name}. Do not deploy this artifact.`);
}
await fs.cp('.next/static','.next/standalone/.next/static',{recursive:true});
await fs.cp('public','.next/standalone/public',{recursive:true});
console.log('Prepared the standalone Node server and its static assets.');
