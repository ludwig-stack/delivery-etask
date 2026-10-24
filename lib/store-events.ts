export type EventRow={id:string;entity_type:'task'|'milestone'|'metrics'|'profile'|'settings'|'inbox';entity_id:string;version:number;payload:string;actor_id:string;actor_name:string;at:string};
type LoginAttempt={identifier:string;at:string};
export type StoreData={schema:'dsi-json-store/1';revision:number;updatedAt:string;events:EventRow[];loginAttempts:LoginAttempt[]};
export class StoreConflict extends Error {}
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
  if(!e||typeof e!=='object'||!['task','milestone','metrics','profile','settings','inbox'].includes(e.entity_type)||!Number.isSafeInteger(e.version)||e.version<1)throw new Error('Invalid JSON event record.');
  for(const field of ['id','entity_id','payload','actor_id','actor_name','at'])if(typeof e[field]!=='string'||!e[field])throw new Error(`Invalid event ${field}.`);
  if(!Number.isFinite(Date.parse(e.at)))throw new Error('Invalid event timestamp.');
  const payload=JSON.parse(e.payload);if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('Invalid event payload.');
  if(ids.has(e.id))throw new Error('Duplicate event ID.');ids.add(e.id);
  const sequence=versions.get(key(e))||new Set<number>();if(sequence.has(e.version))throw new Error('Duplicate event version.');sequence.add(e.version);versions.set(key(e),sequence);
 }
 for(const sequence of versions.values()){const ordered=[...sequence].sort((a,b)=>a-b);if(ordered.some((v,i)=>v!==i+1))throw new Error('Incomplete event version history.');}
}
export function validateStore(value:unknown):asserts value is StoreData {
 const s=value as StoreData;
 if(!s||s.schema!=='dsi-json-store/1'||!Number.isSafeInteger(s.revision)||s.revision<0||!Number.isFinite(Date.parse(s.updatedAt))||!Array.isArray(s.loginAttempts))throw new Error('Invalid JSON database format.');
 validateEvents(s.events);
 for(const attempt of s.loginAttempts)if(typeof attempt.identifier!=='string'||!Number.isFinite(Date.parse(attempt.at)))throw new Error('Invalid login attempt record.');
}
