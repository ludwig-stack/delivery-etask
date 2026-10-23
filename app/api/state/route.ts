import {getStore} from '@delivery/runtime';
import {StoreConflict,type EventRow} from '../../../lib/store-events';
import {getSessionUser,sameOrigin} from '../../../lib/auth';
import {canReview,canAcceptTask,canRecordMetrics} from '../../../lib/permissions';
import source from '../../data/plan.json';
import {type Plan,type Task,gateTasks,validateTaskUpdate,validateMetrics} from '../../../lib/delivery';
const plan=source as unknown as Plan;
export const dynamic='force-dynamic';
const decode=(row:EventRow)=>({id:row.id,entityType:row.entity_type,entityId:row.entity_id,version:row.version,payload:JSON.parse(row.payload),actorName:row.actor_name,at:row.at});
class ApiError extends Error{constructor(readonly status:number,message:string){super(message);}}
function failure(error:unknown){
 if(error instanceof ApiError)return Response.json({error:error.message},{status:error.status});
 if(error instanceof StoreConflict)return Response.json({error:error.message},{status:409});
 console.error('Delivery store error',error instanceof Error?error.message:'unknown');
 return Response.json({error:'The tracker could not save or load this change. Your entry has been kept on screen. Please retry.'},{status:503});
}
export async function GET(){
 const user=await getSessionUser();if(!user)return Response.json({error:'Sign in to load shared progress.'},{status:401});
 try{
  const {latest,audit}=await getStore().snapshot();
  const overrides:Record<string,unknown>={},metrics:Record<string,unknown>={},milestones:Record<string,unknown>={};
  for(const raw of latest){const e=decode(raw);(e.entityType==='task'?overrides:e.entityType==='milestone'?milestones:metrics)[e.entityId]={...e.payload,version:e.version,updatedAt:e.at};}
  return Response.json({overrides,metrics,milestones,audit:audit.map(decode),user:{name:user.displayName},syncedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return failure(error);}
}
export async function POST(request:Request){
 const user=await getSessionUser();if(!user)return Response.json({error:'Sign in to save shared progress.'},{status:401});
 if(!sameOrigin(request))return Response.json({error:'Cross-origin updates are not allowed.'},{status:403});
 if(user.role==='viewer')return Response.json({error:'Your account has read-only delivery access.'},{status:403});
 try{
  const body=await request.json() as {entityType:EventRow['entity_type'];entityId:string;version:number;data:Record<string,unknown>};
  if(!body||!body.data||typeof body.data!=='object'||Array.isArray(body.data))throw new ApiError(400,'Enter a valid record update.');
  if(!['task','milestone','metrics'].includes(body.entityType)||typeof body.entityId!=='string')throw new ApiError(400,'Unknown record type.');
  if(!Number.isInteger(body.version)||body.version<0)throw new ApiError(400,'Refresh to get the current record version.');
  const row=await getStore().commitEvent(rows=>{
   const latest=rows.map(decode),previous=latest.find(e=>e.entityType===body.entityType&&e.entityId===body.entityId);
   if((previous?.version||0)!==body.version)throw new ApiError(409,'Someone updated this record while you were editing. Refresh, review their change, then save again.');
   let value:any;
   if(body.entityType==='task'||body.entityType==='milestone'){
    const work=[...plan.tasks,...gateTasks(plan)];
    const base=work.find(t=>t.id===body.entityId&&(body.entityType==='task'?t.workstream!=='Delivery gate':t.workstream==='Delivery gate'));
    if(!base)throw new ApiError(404,'This task is not in the active plan.');
    if(!canReview(user.role)&&(body.entityType==='milestone'||base.owner!==user.owner))throw new ApiError(403,'You may update only your assigned deliverables.');
    if(!canReview(user.role)&&(body.data.status==='Accepted'||previous?.payload.status==='Accepted'))throw new ApiError(403,'Only a reviewer or administrator can accept or reopen work.');
    if(body.data.status==='Accepted'&&!canAcceptTask(user.role,user.owner,base.owner))throw new ApiError(403,'A different authorized reviewer must accept your own work.');
    const tasks=work.map(t=>({...t,...latest.find(e=>e.entityId===t.id)?.payload})) as Task[];
    const accepted=body.data.status==='Accepted';
    const result=validateTaskUpdate(base,{...body.data,version:body.version,acceptedBy:accepted?user.displayName:'',reviewNote:accepted?(user.role==='admin'?(body.data.reviewNote||`Administrator approval by ${user.displayName}.`):(user.delegation||body.data.reviewNote||'')):body.data.reviewNote},tasks,[...plan.people.map(p=>p.name),user.displayName]);
    if(result.error)throw new ApiError(400,result.error);value=result.value;
    if(accepted)value.closedAt=previous?.payload.status==='Accepted'?previous.payload.closedAt:new Date().toISOString();
   }else{
    if(!canRecordMetrics(user.role,user.owner))throw new ApiError(403,'Daily results may be recorded by Nova, a reviewer, or an administrator.');
    if(!plan.calendar.some(d=>d.date===body.entityId))throw new ApiError(400,'Choose a date inside the project window.');
    const result=validateMetrics(body.data);if(result.error)throw new ApiError(400,result.error);value=result.value;
   }
   const at=new Date().toISOString(),version=body.version+1;value.version=version;value.updatedAt=at;
   return {id:crypto.randomUUID(),entity_type:body.entityType,entity_id:body.entityId,version,payload:JSON.stringify(value),actor_id:user.userId,actor_name:user.displayName,at};
  });
  return Response.json({value:JSON.parse(row.payload),event:decode(row)},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return failure(error);}
}
