import {latestEvents, StoreConflict, validateEvents, validateStore, type EventRow, type StoreData} from './store-events.ts';
export {latestEvents, StoreConflict, type EventRow} from './store-events.ts';
export type SupabaseData=Omit<StoreData,'schema'> & {schema:'dsi-supabase-store/1'};

export class SupabaseStore {
 private readonly url:string;
 private readonly key:string;
 constructor(url:string,key:string){
  if(!url||!key)throw new Error('Configure SUPABASE_URL and SUPABASE_SECRET_KEY on the server.');
  const parsed=new URL(url);
  if(parsed.protocol!=='https:'&&!(parsed.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)))throw new Error('Supabase requires HTTPS except on localhost.');
  if(parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=='/')throw new Error('SUPABASE_URL must be the project base URL.');
  if(key.startsWith('sb_publishable_'))throw new Error('Use a server secret key, not a Supabase publishable key.');
  this.url=parsed.origin;this.key=key;
 }
 private async rpc<T>(name:string,body:Record<string,unknown>={}):Promise<T>{
  const headers:Record<string,string>={'Content-Type':'application/json',apikey:this.key};
  // Legacy service-role JWTs require Authorization; new secret keys use apikey only.
  if(!this.key.startsWith('sb_secret_'))headers.Authorization=`Bearer ${this.key}`;
  const response=await fetch(`${this.url}/rest/v1/rpc/${name}`,{method:'POST',headers,body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!response.ok){
   const error=await response.json().catch(()=>({})) as {code?:string};
   if(error.code==='40001'||error.code==='23505')throw new StoreConflict('Someone updated the tracker. Refresh before saving again.');
   if(error.code==='PGRST202'||error.code==='42883')throw new Error('Supabase schema is missing. Apply supabase/migrations/202610230001_delivery_store.sql.');
   if(response.status===401||response.status===403)throw new Error('Supabase rejected the server credentials or database permissions.');
   if(error.code==='55000')throw new Error('Import requires an empty Supabase database; existing data was preserved.');
   throw new Error(`Supabase database request failed (HTTP ${response.status}).`);
  }
  const text=await response.text();
  return (text?JSON.parse(text):undefined) as T;
 }
 async read():Promise<SupabaseData>{
  const data=await this.rpc<StoreData>('dsi_read_store');
  validateStore({...data,schema:'dsi-json-store/1'});
  return {...data,schema:'dsi-supabase-store/1'};
 }
 async snapshot(){const data=await this.read();return {latest:latestEvents(data.events),audit:[...data.events].reverse().sort((a,b)=>b.at.localeCompare(a.at)).slice(0,150)};}
 async allEvents(){return (await this.read()).events;}
 async commitEvent(create:(latest:EventRow[])=>EventRow):Promise<EventRow>{
  const data=await this.read(),latest=latestEvents(data.events),event=create(latest);
  const previous=latest.find(e=>e.entity_type===event.entity_type&&e.entity_id===event.entity_id);
  if(event.version!==(previous?.version||0)+1||data.events.some(e=>e.id===event.id))throw new StoreConflict('Someone updated this record. Refresh before saving again.');
  validateEvents([...data.events,event]);
  // Compare the global history revision under a database lock so dependency
  // changes cannot race with application validation.
  await this.rpc('dsi_commit_event',{p_revision:data.revision,p_event:event});
  return event;
 }
 async recordLoginAttempt(identifier:string):Promise<boolean>{
  const allowed=await this.rpc<unknown>('dsi_record_login_attempt',{p_identifier:identifier});
  if(typeof allowed!=='boolean')throw new Error('Supabase returned an invalid login-limit response.');
  return allowed;
 }
 async importData(data:unknown){validateStore(data);await this.rpc('dsi_import_store',{p_data:data});}
 async restoreEvents(events:EventRow[]){
  validateEvents(events);
  await this.importData({schema:'dsi-json-store/1',revision:1,updatedAt:new Date().toISOString(),events,loginAttempts:[]});
 }
}
