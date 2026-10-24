import type {EventRow} from './store-events.ts';
import {safeProfile} from './stage-one.ts';
import {userTimezone} from './timezones.ts';
export type Role='staff'|'reviewer'|'admin'|'viewer';
export type Account={id:string;name:string;email?:string;username?:string;role:Role;owner:string;passwordHash:string;salt:string;delegation?:string;enabled?:boolean;sessionVersion?:number};
export function accountsFromRows(base:Account[],rows:EventRow[]):Account[] {
 const profiles=rows.filter(e=>e.entity_type==='profile');
 const accounts=[...base];
 for(const row of profiles){const p=JSON.parse(row.payload);if(p.registered===true&&!accounts.some(a=>a.id===row.entity_id)&&typeof p.passwordHash==='string'&&typeof p.salt==='string')accounts.push({id:row.entity_id,name:String(p.name||''),username:String(p.username||''),email:String(p.email||''),passwordHash:p.passwordHash,salt:p.salt,role:'staff',owner:'',enabled:false});}
 return accounts.map(account=>{
  const row=profiles.find(e=>e.entity_id===account.id),p=row?JSON.parse(row.payload):{};
  return {...account,...Object.fromEntries(['name','email','username','passwordHash','salt','owner'].filter(k=>typeof p[k]==='string').map(k=>[k,p[k]])),enabled:typeof p.enabled==='boolean'?p.enabled:account.enabled!==false,sessionVersion:Number.isSafeInteger(p.sessionVersion)?p.sessionVersion:0};
 });
}
export function accountProfile(account:Account,rows:EventRow[]) {
 const row=rows.find(e=>e.entity_type==='profile'&&e.entity_id===account.id),p=row?JSON.parse(row.payload):{};
 return {theme:'default',notifyAssignments:true,notifyMentions:true,firstName:account.name.split(' ')[0],lastName:account.name.split(' ').slice(1).join(' '),image:'',...safeProfile(p),id:account.id,name:account.name,username:account.username||'',email:account.email||'',role:account.role,owner:account.owner,enabled:account.enabled!==false,timezone:userTimezone(p.timezone),version:row?.version||0};
}
export function validateIdentity(input:Record<string,unknown>,requireNames=false) {
 const username=String(input.username||'').trim().toLowerCase(),email=String(input.email||'').trim().toLowerCase();
 const firstName=String(input.firstName||'').trim(),lastName=String(input.lastName||'').trim();
 if(!/^[a-z0-9._-]{3,80}$/.test(username))throw new Error('Username needs 3–80 letters, numbers, dots, underscores or hyphens.');
 if((requireNames&&!email)||email.length>254||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))throw new Error('Enter a valid email.');
 if((requireNames&&(!firstName||!lastName))||firstName.length>80||lastName.length>80)throw new Error('Enter first and last names of at most 80 characters each.');
 return {username,email,firstName,lastName};
}
export function assertUniqueIdentity(accounts:Account[],identity:{username:string;email:string},exceptId?:string) {
 if(accounts.some(a=>a.id!==exceptId&&[a.username?.toLowerCase(),a.email?.toLowerCase()].some(v=>v&&(v===identity.username||v===identity.email))))throw new Error('That email or username is already in use.');
}
