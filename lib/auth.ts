import { runtimeEnv } from '@delivery/runtime';
import { cookies } from 'next/headers';
export {sameOrigin} from './request-origin';

export type Role = 'staff' | 'reviewer' | 'admin' | 'viewer';
export type Account = {id:string;name:string;email:string;role:Role;owner:string;passwordHash:string;salt:string;delegation?:string};
export type SessionUser = Omit<Account,'passwordHash'|'salt'> & {userId:string;displayName:string};
const COOKIE='dsi_session';
const enc=new TextEncoder();
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const bytes=(value:string)=>Uint8Array.from(value.match(/.{2}/g)||[],x=>parseInt(x,16));
export function authConfig() {
  const config=runtimeEnv;
  const users:Account[]=JSON.parse(config.AUTH_USERS_JSON||'[]');
  if(!config.SESSION_SECRET || config.SESSION_SECRET.length<32 || !users.length) throw new Error('Run npm run setup:local to configure local accounts.');
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
    const {users,secret}=authConfig();
    const token=(await cookies()).get(COOKIE)?.value;
    if(!token || token.length>2000) return null;
    const [payload,signature,...rest]=token.split('.');
    if(rest.length || !/^[a-f0-9]{64}$/.test(signature||'')) return null;
    if(!await crypto.subtle.verify('HMAC',await key(secret),bytes(signature),enc.encode(payload))) return null;
    const parsed=JSON.parse(atob(payload));
    if(typeof parsed.exp!=='number'||parsed.exp<=Date.now()) return null;
    const account=users.find(a=>a.id===parsed.sub);
    if(!account || parsed.credential!==hex(await crypto.subtle.digest('SHA-256',enc.encode(account.passwordHash)))) return null;
    const {passwordHash:_hash,salt:_salt,...safe}=account;
    return {...safe,userId:account.id,displayName:account.name};
  } catch {return null;}
}
export const isReviewer=(user:SessionUser)=>user.role==='reviewer';
