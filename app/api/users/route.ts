import {getStore} from '@delivery/runtime';
import {authConfig,getSessionUser,sameOrigin} from '../../../lib/auth';
import {accountProfile,accountsFromRows,assertUniqueIdentity,validateIdentity} from '../../../lib/accounts';
import {canReview} from '../../../lib/permissions';
import {validImage} from '../../../lib/stage-one';
import {isUserTimezone,userTimezone} from '../../../lib/timezones';
import {StoreConflict} from '../../../lib/store-events';
import plan from '../../data/plan.json';
export async function GET(){
 const user=await getSessionUser();if(!user)return Response.json({error:'Sign in first.'},{status:401});
 if(!canReview(user.role))return Response.json({error:'Administrator or reviewer access required.'},{status:403});
 try{const {latest}=await getStore().snapshot();return Response.json({users:accountsFromRows(authConfig().users,latest).map(a=>accountProfile(a,latest)),currentUserId:user.id,owners:plan.people.map(p=>p.name)},{headers:{'Cache-Control':'no-store'}});}
 catch{return Response.json({error:'Unable to load users.'},{status:503});}
}
export async function POST(request:Request){
 const user=await getSessionUser();if(!user)return Response.json({error:'Sign in first.'},{status:401});
 if(!canReview(user.role)||!sameOrigin(request))return Response.json({error:'Administrator or reviewer access required on this site.'},{status:403});
 try{
  const raw=await request.text();if(raw.length>500000)throw new Error('Profile image is too large.');
  const body=JSON.parse(raw) as {userId:string;version:number;action:'profile'|'status';data:Record<string,unknown>};
  if(!body.userId||!Number.isInteger(body.version)||body.version<0||!['profile','status'].includes(body.action))throw new Error('Enter a valid user update.');
  const data=body.data||{};
  if(body.action==='status'&&(typeof data.enabled!=='boolean'||body.userId===user.id))return Response.json({error:body.userId===user.id?'You cannot enable or disable your own account.':'Choose enabled or disabled.'},{status:400});
  const row=await getStore().commitEvent(rows=>{
   const accounts=accountsFromRows(authConfig().users,rows),actor=accounts.find(a=>a.id===user.id),target=accounts.find(a=>a.id===body.userId);
   if(!actor?.enabled||!canReview(actor.role))throw new Error('Your account no longer has user-management access.');
   if(!target)throw new Error('User was not found.');
   const previous=rows.find(e=>e.entity_type==='profile'&&e.entity_id===target.id);
   if((previous?.version||0)!==body.version)throw new StoreConflict('This user was updated. Refresh and review the latest profile.');
   const prior=previous?JSON.parse(previous.payload):{};let value={...prior};
   if(body.action==='status'){
    value={...value,enabled:data.enabled,sessionVersion:(target.sessionVersion||0)+(target.enabled!==data.enabled?1:0),...(data.enabled?{approvedAt:prior.approvedAt||new Date().toISOString()}:{})};
   }else{
    const identity=validateIdentity(data);assertUniqueIdentity(accounts,identity,target.id);
    if(!validImage(data.image||''))throw new Error('Choose a PNG, JPEG or WebP image under 250 KB.');
    if(!isUserTimezone(data.timezone))throw new Error('Choose PST, PDT or PHT.');
    if(typeof data.owner!=='string'||data.owner!==''&&!plan.people.some(p=>p.name===data.owner))throw new Error('Choose a task owner from the team or leave it unassigned.');
    value={...value,...identity,name:[identity.firstName,identity.lastName].filter(Boolean).join(' ')||target.name,image:data.image||'',timezone:userTimezone(data.timezone),owner:data.owner};
   }
   return {id:crypto.randomUUID(),entity_type:'profile',entity_id:target.id,version:body.version+1,payload:JSON.stringify(value),actor_id:user.id,actor_name:user.name,at:new Date().toISOString()};
  });
  const {latest}=await getStore().snapshot(),updated=accountsFromRows(authConfig().users,latest).find(a=>a.id===body.userId)!;
  return Response.json({user:accountProfile(updated,latest),version:row.version},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Unable to update user.'},{status:e instanceof StoreConflict?409:400});}
}
