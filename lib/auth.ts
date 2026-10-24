import { runtimeEnv, getStore } from '@delivery/runtime';
import { cookies } from 'next/headers';
export {sameOrigin} from './request-origin';

export type Role = 'staff' | 'reviewer' | 'admin' | 'viewer';
export type Account = {id:string;name:string;email?:string;username?:string;role:Role;owner:string;passwordHash:string;salt:string;delegation?:string};
export type SessionUser = Omit<Account,'passwordHash'|'salt'> & {userId:string;displayName:string};
export async function resolvedAccounts() {
 const {users}=authConfig();
 const {latest}=await getStore().snapshot();
 return users.map(account=>{const row=latest.find(e=>e.entity_type==='profile'&&e.entity_id===account.id);const p=row?JSON.parse(row.payload):{};
  return {...account,...Object.fromEntries(['name','email','username','passwordHash','salt'].filter(k=>typeof p[k]==='string').map(k=>[k,p[k]]))} as Account;
 });
}
export async function hashPassword(password:string,salt:string) {
 const material=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
 return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',iterations:100000,salt:enc.encode(salt)},material,256));
}
export class AuthConfigurationError extends Error {}
const COOKIE='dsi_session';
const enc=new TextEncoder();
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const bytes=(value:string)=>Uint8Array.from(value.match(/.{2}/g)||[],x=>parseInt(x,16));
export function authConfig() {
  const config=runtimeEnv;
  let users:Account[];
  try {users=JSON.parse(config.AUTH_USERS_JSON||'[]');}
  catch {throw new AuthConfigurationError('AUTH_USERS_JSON must be a valid array of approved accounts.');}
  if(!config.SESSION_SECRET || config.SESSION_SECRET.length<32 || !Array.isArray(users) || !users.length) throw new AuthConfigurationError('Configure SESSION_SECRET and AUTH_USERS_JSON for this deployment environment.');
  return {users,secret:config.SESSION_SECRET};
}
async function key(secret:string) {return crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
export async function passwordMatches(account:Account,password:string) {
  const material=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
  const derived=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',iterations:100000,salt:enc.encode(account.salt)},material,256);
  // Constant-time signature verification avoids comparing secrets as strings.
  const comparisonKey=await key(account.passwordHash);
  const expected=await crypto.subtle.sign('HMAC',comparisonKey,enc.encode(account.passwordHash));
  return crypto.subtle.verify('HMAC',comparisonKey,expected,enc.encode(hex(derived)));
}
export async function issueSession(account:Account,secure:boolean) {
  const {secret}=authConfig();
  const payload=btoa(JSON.stringify({sub:account.id,exp:Date.now()+8*60*60*1000,credential:hex(await crypto.subtle.digest('SHA-256',enc.encode(account.passwordHash)))}));
  const signature=hex(await crypto.subtle.sign('HMAC',await key(secret),enc.encode(payload)));
  return `${COOKIE}=${payload}.${signature}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${secure?'; Secure':''}`;
}
export function clearSession(secure:boolean) {return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure?'; Secure':''}`;}
export async function getSessionUser():Promise<SessionUser|null> {
  try {
    const {secret}=authConfig();
    const token=(await cookies()).get(COOKIE)?.value;
    if(!token || token.length>2000) return null;
    const [payload,signature,...rest]=token.split('.');
    if(rest.length || !/^[a-f0-9]{64}$/.test(signature||'')) return null;
    if(!await crypto.subtle.verify('HMAC',await key(secret),bytes(signature),enc.encode(payload))) return null;
    const parsed=JSON.parse(atob(payload));
    if(typeof parsed.exp!=='number'||parsed.exp<=Date.now()) return null;
    const account=(await resolvedAccounts()).find(a=>a.id===parsed.sub);
    if(!account || parsed.credential!==hex(await crypto.subtle.digest('SHA-256',enc.encode(account.passwordHash)))) return null;
    const {passwordHash:_hash,salt:_salt,...safe}=account;
    return {...safe,userId:account.id,displayName:account.name};
  } catch {return null;}
}
