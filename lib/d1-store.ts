import {latestEvents, StoreConflict, validateEvents, validateStore, type EventRow, type StoreData} from './store-events.ts';
export {StoreConflict, latestEvents, type EventRow} from './store-events.ts';
export type D1Data=Omit<StoreData,'schema'> & {schema:'dsi-d1-store/1'};
const fields='id,entity_type,entity_id,version,payload,actor_id,actor_name,at';

// Runs in the database Worker. All reads use the primary and all multi-statement
// operations use D1 batches (transactions), including login limits and imports.
export class D1Store {
 private readonly db:D1DatabaseSession;
 constructor(db:D1Database){this.db=db.withSession('first-primary');}
 async read():Promise<D1Data>{
  const [metadata,events,attempts]=await this.db.batch([
   this.db.prepare('SELECT revision,updated_at FROM dsi_store_metadata WHERE id=1'),
   this.db.prepare(`SELECT ${fields} FROM delivery_events ORDER BY rowid`),
   this.db.prepare('SELECT identifier,at FROM auth_attempts ORDER BY rowid'),
  ]);
  const meta=metadata.results[0] as {revision:number;updated_at:string}|undefined;
  if(!meta)throw new Error('D1 schema is missing. Apply the D1 migrations.');
  const data={schema:'dsi-json-store/1' as const,revision:meta.revision,updatedAt:meta.updated_at,events:events.results as EventRow[],loginAttempts:attempts.results as StoreData['loginAttempts']};
  validateStore(data);return {...data,schema:'dsi-d1-store/1'};
 }
 async append(revision:number,event:EventRow){
  if(!Number.isSafeInteger(revision)||revision<0)throw new Error('Invalid revision.');
  if(!event||!Number.isSafeInteger(event.version)||event.version<1)throw new Error('Invalid event version.');
  // Full sequence validation happens in the database trigger, too. Validate the
  // incoming row here without rejecting a valid continuation (version > 1).
  validateEvents([{...event,version:1}]);
  const [result]=await this.db.batch([this.db.prepare(`INSERT INTO delivery_events (${fields}) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT revision FROM dsi_store_metadata WHERE id=1)=?`)
   .bind(event.id,event.entity_type,event.entity_id,event.version,event.payload,event.actor_id,event.actor_name,event.at,revision)]);
  if(result.meta.changes===0)throw new StoreConflict('Someone updated the tracker. Refresh before saving again.');
 }
 async recordLoginAttempt(identifier:string):Promise<boolean>{
  if(typeof identifier!=='string'||!identifier||identifier.length>512)throw new Error('Invalid login identifier.');
  const [,result]=await this.db.batch([
   this.db.prepare("DELETE FROM auth_attempts WHERE julianday(at)<julianday('now','-15 minutes')"),
   this.db.prepare("INSERT INTO auth_attempts (identifier,at) SELECT ?,strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE (SELECT count(*) FROM auth_attempts WHERE identifier=?)<8 RETURNING identifier").bind(identifier,identifier),
   this.db.prepare("UPDATE dsi_store_metadata SET revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=1"),
  ]);
  return result.results.length===1;
 }
 async importData(data:unknown){
  validateStore(data);
  // json_each keeps the batch bounded even for a long event history. D1's
  // maximum bound string is 2 MB; refuse an oversized import before any writes.
  const events=JSON.stringify(data.events),attempts=JSON.stringify(data.loginAttempts);
  if([events,attempts].some(value=>new TextEncoder().encode(value).length>1_900_000))throw new Error('D1 import exceeds the supported 1.9 MB per collection. Use an offline SQL migration for larger backups.');
  await this.db.batch([
   this.db.prepare('UPDATE dsi_store_metadata SET import_guard=CASE WHEN revision=0 AND NOT EXISTS(SELECT 1 FROM delivery_events) AND NOT EXISTS(SELECT 1 FROM auth_attempts) THEN 0 ELSE 1 END WHERE id=1'),
   this.db.prepare(`INSERT INTO delivery_events (${fields}) SELECT json_extract(value,'$.id'),json_extract(value,'$.entity_type'),json_extract(value,'$.entity_id'),json_extract(value,'$.version'),json_extract(value,'$.payload'),json_extract(value,'$.actor_id'),json_extract(value,'$.actor_name'),json_extract(value,'$.at') FROM json_each(?) ORDER BY CAST(key AS INTEGER)`).bind(events),
   this.db.prepare("INSERT INTO auth_attempts (identifier,at) SELECT json_extract(value,'$.identifier'),json_extract(value,'$.at') FROM json_each(?)").bind(attempts),
   this.db.prepare('UPDATE dsi_store_metadata SET revision=?,updated_at=? WHERE id=1').bind(data.revision,data.updatedAt),
  ]);
 }
}

// The Next.js server uses fixed authenticated operations, never browser database
// credentials or Cloudflare's account-wide administrative query API.
export class D1HttpStore {
 private readonly url:string;
 private readonly secret:string;
 constructor(url:string,secret:string){
  if(!url||!secret)throw new Error('Configure D1_WORKER_URL and D1_WORKER_SECRET on the server.');
  const parsed=new URL(url);
  if(parsed.protocol!=='https:'&&!(parsed.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)))throw new Error('D1 Worker requires HTTPS except on localhost.');
  if(parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=='/')throw new Error('D1_WORKER_URL must be the Worker base URL.');
  if(secret.length<32)throw new Error('D1_WORKER_SECRET must have at least 32 characters.');
  this.url=parsed.origin;this.secret=secret;
 }
 private async call<T>(operation:string,body:Record<string,unknown>={}):Promise<T>{
  const response=await fetch(`${this.url}/${operation}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${this.secret}`},body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(30000)});
  if(response.status===409)throw new StoreConflict('Someone updated the tracker. Refresh before saving again.');
  if(response.status===401||response.status===403)throw new Error('D1 Worker rejected the server credentials.');
  if(!response.ok){const error=await response.json().catch(()=>({})) as {code?:string};
   if(error.code==='NOT_EMPTY')throw new Error('Import requires an empty D1 database; existing data was preserved.');
   if(error.code==='SCHEMA_MISSING')throw new Error('D1 schema is missing. Apply the D1 migrations.');
   if(error.code==='IMPORT_TOO_LARGE')throw new Error('D1 import exceeds the supported size. Use an offline SQL migration.');
   throw new Error(`D1 database request failed (HTTP ${response.status}).`);
  }
  return await response.json() as T;
 }
 async read():Promise<D1Data>{
  const data=await this.call<D1Data>('read');
  validateStore({...data,schema:'dsi-json-store/1'});return data;
 }
 async snapshot(){const data=await this.read();return {latest:latestEvents(data.events),audit:[...data.events].reverse().sort((a,b)=>b.at.localeCompare(a.at)).slice(0,150)};}
 async allEvents(){return (await this.read()).events;}
 async commitEvent(create:(latest:EventRow[])=>EventRow):Promise<EventRow>{
  const data=await this.read(),latest=latestEvents(data.events),event=create(latest);
  const previous=latest.find(e=>e.entity_type===event.entity_type&&e.entity_id===event.entity_id);
  if(event.version!==(previous?.version||0)+1||data.events.some(e=>e.id===event.id))throw new StoreConflict('Someone updated this record. Refresh before saving again.');
  validateEvents([...data.events,event]);await this.call('commit',{revision:data.revision,event});return event;
 }
 async recordLoginAttempt(identifier:string):Promise<boolean>{
  const allowed=await this.call<unknown>('login',{identifier});
  if(typeof allowed!=='boolean')throw new Error('D1 returned an invalid login-limit response.');return allowed;
 }
 async importData(data:unknown){validateStore(data);await this.call('import',{data});}
 async restoreEvents(events:EventRow[]){validateEvents(events);await this.importData({schema:'dsi-json-store/1',revision:1,updatedAt:new Date().toISOString(),events,loginAttempts:[]});}
}
