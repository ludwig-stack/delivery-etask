import {getStore} from '@delivery/runtime';
import {authConfig,hashPassword,sameOrigin} from '../../../../lib/auth';
import {accountsFromRows,assertUniqueIdentity,validateIdentity} from '../../../../lib/accounts';
import {passwordStrength} from '../../../../lib/stage-one';
import {StoreConflict} from '../../../../lib/store-events';
export async function POST(request:Request){
 if(!sameOrigin(request))return Response.json({error:'Use the sign-up form on this site.'},{status:403});
 try{
  const raw=await request.text();if(raw.length>10000)throw new Error('The sign-up form is too large.');
  const input=JSON.parse(raw) as Record<string,unknown>,identity=validateIdentity(input,true);
  if(typeof input.password!=='string'||input.password.length>200||passwordStrength(input.password)==='weak')throw new Error('Choose a medium or strong password: at least 12 characters and three character types.');
  if(input.password!==input.confirmPassword)throw new Error('Passwords do not match.');
  if(!await getStore().recordLoginAttempt(`signup:${identity.email}`))return Response.json({error:'Too many sign-up attempts. Try again in 15 minutes.'},{status:429});
  const base=authConfig().users,salt=crypto.randomUUID(),passwordHash=await hashPassword(input.password,salt);
  const id=`user-${crypto.randomUUID()}`,at=new Date().toISOString();
  await getStore().commitEvent(rows=>{
   assertUniqueIdentity(accountsFromRows(base,rows),identity);
   const value={...identity,name:`${identity.firstName} ${identity.lastName}`,registered:true,enabled:false,approvedAt:null,sessionVersion:0,passwordHash,salt,theme:'default',timezone:'PST',notifyAssignments:true,notifyMentions:true,image:''};
   return {id:crypto.randomUUID(),entity_type:'profile',entity_id:id,version:1,payload:JSON.stringify(value),actor_id:id,actor_name:value.name,at};
  });
  return Response.json({message:'Sign-up successful. Your account is disabled until an administrator or reviewer enables it.'},{status:201,headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Unable to sign up.'},{status:e instanceof StoreConflict?409:400});}
}
