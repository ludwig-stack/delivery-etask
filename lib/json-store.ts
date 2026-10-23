import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

export type EventRow={id:string;entity_type:'task'|'milestone'|'metrics';entity_id:string;version:number;payload:string;actor_id:string;actor_name:string;at:string};
type LoginAttempt={identifier:string;at:string};
export type StoreData={schema:'dsi-json-store/1';revision:number;updatedAt:string;events:EventRow[];loginAttempts:LoginAttempt[]};
export class StoreConflict extends Error {}
const empty=():StoreData=>({schema:'dsi-json-store/1',revision:0,updatedAt:new Date().toISOString(),events:[],loginAttempts:[]});
const key=(event:EventRow)=>JSON.stringify([event.entity_type,event.entity_id]);
export function latestEvents(events:EventRow[]) {
 const latest=new Map<string,EventRow>();
 for(const event of events){const old=latest.get(key(event));if(!old||old.version<event.version)latest.set(key(event),event);}
 return [...latest.values()];
}
export function validateEvents(events:unknown):asserts events is EventRow[] {
 if(!Array.isArray(events))throw new Error('Invalid JSON event history.');
 const ids=new Set<string>(),versions=new Map<string,Set<number>>();
 for(const e of events){
  if(!e||typeof e!=='object'||!['task','milestone','metrics'].includes(e.entity_type)||!Number.isSafeInteger(e.version)||e.version<1)throw new Error('Invalid JSON event record.');
  for(const field of ['id','entity_id','payload','actor_id','actor_name','at'])if(typeof e[field]!=='string'||!e[field])throw new Error(`Invalid event ${field}.`);
  if(!Number.isFinite(Date.parse(e.at)))throw new Error('Invalid event timestamp.');
  const payload=JSON.parse(e.payload);if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('Invalid event payload.');
  if(ids.has(e.id))throw new Error('Duplicate event ID.');ids.add(e.id);
  const sequence=versions.get(key(e))||new Set<number>();if(sequence.has(e.version))throw new Error('Duplicate event version.');sequence.add(e.version);versions.set(key(e),sequence);
 }
 for(const sequence of versions.values()){const ordered=[...sequence].sort((a,b)=>a-b);if(ordered.some((v,i)=>v!==i+1))throw new Error('Incomplete event version history.');}
}
function validateStore(value:unknown):asserts value is StoreData {
 const s=value as StoreData;
 if(!s||s.schema!=='dsi-json-store/1'||!Number.isSafeInteger(s.revision)||s.revision<0||!Number.isFinite(Date.parse(s.updatedAt))||!Array.isArray(s.loginAttempts))throw new Error('Invalid JSON database format.');
 validateEvents(s.events);
 for(const attempt of s.loginAttempts)if(typeof attempt.identifier!=='string'||!Number.isFinite(Date.parse(attempt.at)))throw new Error('Invalid login attempt record.');
}
const isMissing=(error:unknown)=>(error as NodeJS.ErrnoException)?.code==='ENOENT';

// All writers share an exclusive lock; saves atomically replace a file in the
// same directory. No database service or database driver is used.
export class JsonStore {
 readonly file:string;
 private readonly lockTimeoutMs:number;
 constructor(file:string,lockTimeoutMs=5000){this.file=path.resolve(file);this.lockTimeoutMs=lockTimeoutMs;}
 private async readExisting():Promise<StoreData|null>{
  let raw:string;
  try{raw=await fs.readFile(this.file,'utf8');}catch(error){if(isMissing(error))return null;throw error;}
  try{const data:unknown=JSON.parse(raw);validateStore(data);return data;}
  catch{throw new Error('The JSON database is invalid. Its contents were preserved; restore a verified backup before writing.');}
 }
 private async locked<T>(run:()=>Promise<T>):Promise<T>{
  await fs.mkdir(path.dirname(this.file),{recursive:true});
  const lockPath=this.file+'.lock',token=randomUUID(),started=Date.now();
  let handle;
  for(;;){
   try{handle=await fs.open(lockPath,'wx',0o600);break;}
   catch(error){
    if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
    if(Date.now()-started>=this.lockTimeoutMs)throw new Error('The JSON database is busy or has a lock from a stopped process. Retry, or stop the server and inspect its .lock file.');
    await new Promise(resolve=>setTimeout(resolve,25));
   }
  }
  try{
   await handle.writeFile(JSON.stringify({pid:process.pid,token,createdAt:new Date().toISOString()}));await handle.sync();
   return await run();
  }finally{
   await handle.close();
   const owner=JSON.parse(await fs.readFile(lockPath,'utf8'));
   if(owner.token!==token)throw new Error('JSON database lock ownership changed.');
   await fs.unlink(lockPath);
  }
 }
 private async save(data:StoreData){
  validateStore(data);
  const temp=`${this.file}.tmp-${process.pid}-${randomUUID()}`;
  const handle=await fs.open(temp,'wx',0o600);
  try{await handle.writeFile(JSON.stringify(data,null,2)+'\n');await handle.sync();}finally{await handle.close();}
  try{await fs.rename(temp,this.file);}catch(error){await fs.unlink(temp).catch(()=>{});throw error;}
  if(process.platform!=='win32'){const dir=await fs.open(path.dirname(this.file),'r');try{await dir.sync();}finally{await dir.close();}}
 }
 async read():Promise<StoreData>{
  const existing=await this.readExisting();if(existing)return existing;
  return this.locked(async()=>{const current=await this.readExisting();if(current)return current;const data=empty();await this.save(data);return data;});
 }
 async snapshot(){const data=await this.read();return {latest:latestEvents(data.events),audit:[...data.events].reverse().sort((a,b)=>b.at.localeCompare(a.at)).slice(0,150)};}
 async allEvents(){return (await this.read()).events;}
 async commitEvent(create:(latest:EventRow[])=>EventRow):Promise<EventRow>{
  return this.locked(async()=>{
   const data=await this.readExisting()||empty();
   const latest=latestEvents(data.events),event=create(latest);
   const previous=latest.find(e=>key(e)===key(event));
   if(event.version!==(previous?.version||0)+1||data.events.some(e=>e.id===event.id))throw new StoreConflict('Someone updated this record. Refresh before saving again.');
   data.events.push(event);data.revision++;data.updatedAt=new Date().toISOString();await this.save(data);return event;
  });
 }
 async recordLoginAttempt(identifier:string,now=new Date()):Promise<boolean>{
  return this.locked(async()=>{
   const data=await this.readExisting()||empty(),since=now.getTime()-15*60*1000;
   data.loginAttempts=data.loginAttempts.filter(a=>Date.parse(a.at)>since);
   if(data.loginAttempts.filter(a=>a.identifier===identifier).length>=8)return false;
   data.loginAttempts.push({identifier,at:now.toISOString()});data.revision++;data.updatedAt=now.toISOString();await this.save(data);return true;
  });
 }
 async restoreEvents(events:EventRow[]){
  validateEvents(events);
  await this.locked(async()=>{if(await this.readExisting())throw new Error('Restore requires a new destination file; existing data was preserved.');const data=empty();data.events=events;data.revision=1;await this.save(data);});
 }
}
