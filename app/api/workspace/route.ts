import {getStore} from '@delivery/runtime';
import {authConfig,getSessionUser,resolvedAccounts,issueSession,sameOrigin} from '../../../lib/auth';
import {safeProfile,THEMES,validImage} from '../../../lib/stage-one';
import {accountsFromRows,accountProfile,assertUniqueIdentity,validateIdentity} from '../../../lib/accounts';
import {StoreConflict} from '../../../lib/store-events';
import {isUserTimezone,userTimezone} from '../../../lib/timezones';
export const dynamic='force-dynamic';
export async function GET(){
 const user=await getSessionUser();if(!user)return Response.json({error:'Sign in first.'},{status:401});
 try{const {latest}=await getStore().snapshot();
 const account=accountsFromRows(authConfig().users,latest).find(a=>a.id===user.id)!;
 const settings=latest.find(e=>e.entity_type==='settings'&&e.entity_id==='workspace');
 return Response.json({profile:accountProfile(account,latest),settings:{workspaceName:'Daily Delivery',defaultTheme:'default',refreshSeconds:60,...(settings?JSON.parse(settings.payload):{}),version:settings?.version||0}},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Unable to load your profile.'},{status:503});}
}
export async function POST(request:Request){
 const user=await getSessionUser();if(!user)return Response.json({error:'Sign in first.'},{status:401});
 if(!sameOrigin(request))return Response.json({error:'Cross-origin update denied.'},{status:403});
 try{
 if(Number(request.headers.get('content-length')||0)>500000)throw new Error('Image is too large.');
 const raw=await request.text();if(raw.length>500000)throw new Error('Image is too large.');
 const body=JSON.parse(raw) as {kind:'profile'|'settings'|'inbox';version:number;data:Record<string,unknown>};const kind=body.kind;
 if(!['profile','settings','inbox'].includes(kind))throw new Error('Unknown setting.');
 if(kind==='settings'&&user.role!=='admin')return Response.json({error:'Only administrators can change workspace settings.'},{status:403});
 if(!Number.isInteger(body.version)||body.version<0)throw new Error('Refresh before saving.');
 const data=body.data||{};
 if(kind==='profile'&&data.newPassword)throw new Error('Use the Change Password page to update your password.');
 const event=await getStore().commitEvent(rows=>{
  const accounts=accountsFromRows(authConfig().users,rows);
  if(accounts.find(a=>a.id===user.id)?.enabled===false)throw new Error('This account has been disabled.');
  const id=kind==='settings'?'workspace':user.id,old=rows.find(e=>e.entity_type===kind&&e.entity_id===id);
  if((old?.version||0)!==body.version)throw new StoreConflict('This page changed. Refresh before saving.');
  const prior=old?JSON.parse(old.payload):{};let value:Record<string,unknown>;
  if(kind==='profile'){
   const {firstName,lastName,username,email}=validateIdentity(data);
   assertUniqueIdentity(accounts,{username,email},user.id);
   if(!validImage(data.image||''))throw new Error('Choose a PNG, JPEG or WebP image under 250 KB.');
   if(!THEMES.includes(data.theme as typeof THEMES[number]))throw new Error('Choose a valid theme.');
   if(data.timezone!==undefined&&!isUserTimezone(data.timezone))throw new Error('Choose PST, PDT or PHT as your timezone.');
   value={...prior,firstName,lastName,name:[firstName,lastName].filter(Boolean).join(' ')||user.name,username,email,image:data.image||'',theme:data.theme,timezone:data.timezone??userTimezone(prior.timezone),notifyAssignments:data.notifyAssignments!==false,notifyMentions:data.notifyMentions!==false};
  }else if(kind==='settings'){
   if(!THEMES.includes(data.defaultTheme as typeof THEMES[number]))throw new Error('Choose a valid theme.');
   if(!validImage(data.logo||''))throw new Error('Choose a PNG, JPEG or WebP logo under 250 KB.');
   if(typeof data.refreshSeconds!=='number'||!Number.isInteger(data.refreshSeconds)||data.refreshSeconds<30||data.refreshSeconds>300)throw new Error('Refresh interval must be 30–300 seconds.');
   value={workspaceName:String(data.workspaceName||'Daily Delivery').trim().slice(0,80),defaultTheme:data.defaultTheme,refreshSeconds:data.refreshSeconds,logo:data.logo||''};
  }else value={readAt:new Date().toISOString()};
  return {id:crypto.randomUUID(),entity_type:kind,entity_id:id,version:body.version+1,payload:JSON.stringify(value),actor_id:user.id,actor_name:user.name,at:new Date().toISOString()};
 });
 const headers:Record<string,string>={'Cache-Control':'no-store'};
 if(kind==='profile')headers['Set-Cookie']=await issueSession((await resolvedAccounts()).find(a=>a.id===user.id)!,new URL(request.url).protocol==='https:');
 return Response.json({value:{...safeProfile(JSON.parse(event.payload)),version:event.version}},{headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Unable to save.'},{status:e instanceof StoreConflict?409:400});}
}
