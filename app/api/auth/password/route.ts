import {getStore} from '@delivery/runtime';
import {authConfig,getSessionUser,resolvedAccounts,passwordMatches,hashPassword,issueSession,sameOrigin} from '../../../../lib/auth';
import {accountsFromRows} from '../../../../lib/accounts';
import {passwordStrength} from '../../../../lib/stage-one';
import {StoreConflict} from '../../../../lib/store-events';
export async function POST(request:Request){
 const user=await getSessionUser();if(!user)return Response.json({error:'Sign in first.'},{status:401});
 if(!sameOrigin(request))return Response.json({error:'Cross-origin update denied.'},{status:403});
 try{
  const raw=await request.text();if(raw.length>10000)throw new Error('Password form is too large.');
  const data=JSON.parse(raw) as Record<string,unknown>;
  if(!Number.isInteger(data.version)||Number(data.version)<0)throw new Error('Refresh before changing your password.');
  if(typeof data.newPassword!=='string'||data.newPassword.length>200||passwordStrength(data.newPassword)==='weak')throw new Error('Choose a medium or strong password: at least 12 characters and three character types.');
  if(data.newPassword!==data.confirmPassword)throw new Error('New passwords do not match.');
  if(!await getStore().recordLoginAttempt(`password:${user.id}`))return Response.json({error:'Too many attempts. Try again in 15 minutes.'},{status:429});
  const account=(await resolvedAccounts()).find(a=>a.id===user.id)!;
  if(typeof data.currentPassword!=='string'||!await passwordMatches(account,data.currentPassword))throw new Error('Enter your correct current password.');
  const salt=crypto.randomUUID(),passwordHash=await hashPassword(data.newPassword,salt);
  await getStore().commitEvent(rows=>{
   if(accountsFromRows(authConfig().users,rows).find(a=>a.id===user.id)?.enabled===false)throw new Error('This account has been disabled.');
   const previous=rows.find(e=>e.entity_type==='profile'&&e.entity_id===user.id);
   if((previous?.version||0)!==data.version)throw new StoreConflict('Your profile changed. Refresh before changing your password.');
   return {id:crypto.randomUUID(),entity_type:'profile',entity_id:user.id,version:Number(data.version)+1,payload:JSON.stringify({...(previous?JSON.parse(previous.payload):{}),passwordHash,salt}),actor_id:user.id,actor_name:user.name,at:new Date().toISOString()};
  });
  const updated=(await resolvedAccounts()).find(a=>a.id===user.id)!;
  return Response.json({message:'Password changed successfully. Other sessions have been signed out.'},{headers:{'Set-Cookie':await issueSession(updated,new URL(request.url).protocol==='https:'),'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Unable to change your password.'},{status:e instanceof StoreConflict?409:400});}
}
