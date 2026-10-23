import fs from 'node:fs';
import crypto from 'node:crypto';
if(fs.existsSync('.dev.vars')) {console.log('Local configuration exists; preserved without changes.');process.exit(0);}
const accounts=[['wyline','Wyline','reviewer','Wyline'],['joey','Joey','staff','Joey'],['nova','Nova','staff','Nova'],['reviewer','Delegated reviewer','reviewer','CEO'],['viewer','Stakeholder','viewer','']];
const credentials=[];
const users=accounts.map(([id,name,role,owner])=>{
  const password=crypto.randomBytes(15).toString('base64url');
  const salt=crypto.randomBytes(16).toString('hex');
  credentials.push(`${name}: ${id}@local.test / ${password}`);
  return {id,name,role,owner,email:`${id}@local.test`,salt,passwordHash:crypto.pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex'),...(id==='reviewer'?{delegation:'Local development delegate for reviewing Wyline-owned work; replace with a verified delegation before production.'}:{})};
});
fs.writeFileSync('.dev.vars',`SESSION_SECRET="${crypto.randomBytes(48).toString('hex')}"\nAUTH_USERS_JSON='${JSON.stringify(users)}'\n`);
fs.writeFileSync('.local-accounts.txt','LOCAL DEVELOPMENT ACCOUNTS ONLY\nOpen http://localhost:5173/login\n\n'+credentials.join('\n')+'\n\nDo not reuse these accounts or configuration in production.\n');
console.log('Generated private local accounts. See .local-accounts.txt for sign-in details.');
