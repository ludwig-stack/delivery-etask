import fs from 'node:fs';
import assert from 'node:assert/strict';
const [input,output]=process.argv.slice(2);
if(!input||!output)throw new Error('Usage: node scripts/restore-backup.mjs backup.json restore.sql');
const backup=JSON.parse(fs.readFileSync(input,'utf8'));
assert.equal(backup.schema,'dsi-events-backup/1');
assert(Array.isArray(backup.events));
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const versions=new Map();
const ids=new Set();
const columns=['id','entity_type','entity_id','version','payload','actor_id','actor_name','at'];
const statements=backup.events.map(e=>{
 for(const key of columns)assert(e[key]!==undefined&&e[key]!==null,`Missing ${key}`);
 assert(['task','milestone','metrics'].includes(e.entity_type));
 assert(Number.isInteger(e.version)&&e.version>0);
 assert(!ids.has(e.id),'Duplicate event ID');ids.add(e.id);
 assert(Number.isFinite(Date.parse(e.at)),'Invalid event timestamp');
 JSON.parse(e.payload);
 const key=`${e.entity_type}:${e.entity_id}`;
 const seq=versions.get(key)||[];seq.push(e.version);versions.set(key,seq);
 return `INSERT INTO delivery_events (${columns.join(',')}) VALUES (${columns.map(k=>k==='version'?e[k]:quote(e[k])).join(',')});`;
});
for(const [key,sequence] of versions){sequence.sort((a,b)=>a-b);sequence.forEach((v,i)=>assert.equal(v,i+1,`Incomplete history: ${key}`));}
// Deliberately fail on duplicates. Restore into an initialized, empty database.
fs.writeFileSync(output,statements.join('\n')+'\n',{flag:'wx'});
console.log(`Validated ${statements.length} events across ${versions.size} records. Wrote restoration SQL; no database was modified.`);
