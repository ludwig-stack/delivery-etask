import { getDatabase } from "@delivery/runtime";
import { getSessionUser, isReviewer, sameOrigin } from "../../../lib/auth";
import source from "../../data/plan.json";
import { type Plan, type Task, gateTasks, validateTaskUpdate, validateMetrics } from "../../../lib/delivery";
const plan=source as unknown as Plan;
export const dynamic="force-dynamic";
const latestSql=`SELECT e.* FROM delivery_events e INNER JOIN (SELECT entity_type, entity_id, MAX(version) AS v FROM delivery_events GROUP BY entity_type, entity_id) x ON e.entity_type=x.entity_type AND e.entity_id=x.entity_id AND e.version=x.v`;

function decode(row:any) {return {id:row.id,entityType:row.entity_type,entityId:row.entity_id,version:row.version,payload:JSON.parse(row.payload),actorName:row.actor_name,at:row.at};}
function failure(error:unknown) { console.error("Delivery store error",error instanceof Error?error.message:"unknown"); return Response.json({error:"The shared tracker could not save or load this change. Your entry has been kept on screen. Please retry."},{status:503}); }

export async function GET() {
  const user=await getSessionUser();
  if(!user) return Response.json({error:"Sign in to load shared progress."},{status:401});
  try {
    const db=await getDatabase();
    const [latest,audit]=await db.batch([
      db.prepare(latestSql),
      db.prepare("SELECT * FROM delivery_events ORDER BY at DESC LIMIT 150"),
    ]);
    const overrides:Record<string,any>={},metrics:Record<string,any>={},milestones:Record<string,any>={};
    for(const raw of latest.results || []) {const e=decode(raw);(e.entityType==="task"?overrides:e.entityType==="milestone"?milestones:metrics)[e.entityId]={...e.payload,version:e.version,updatedAt:e.at};}
    return Response.json({overrides,metrics,milestones,audit:(audit.results||[]).map(decode),user:{name:user.displayName},syncedAt:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});
  } catch(error) { return failure(error); }
}

export async function POST(request:Request) {
  const user=await getSessionUser();
  if(!user) return Response.json({error:"Sign in to save shared progress."},{status:401});
  if(!sameOrigin(request)) return Response.json({error:"Cross-origin updates are not allowed."},{status:403});
  if(user.role==='viewer'||user.role==='admin') return Response.json({error:'Your account has read-only delivery access.'},{status:403});
  try {
    const db=await getDatabase();
    const body:any=await request.json();
    if(!body || typeof body.data!=='object' || body.data===null || Array.isArray(body.data)) return Response.json({error:'Enter a valid record update.'},{status:400});
    if(!["task","milestone","metrics"].includes(body.entityType) || typeof body.entityId!=="string") return Response.json({error:"Unknown record type."},{status:400});
    if(!Number.isInteger(body.version)||body.version<0) return Response.json({error:"Refresh to get the current record version."},{status:400});
    const rows=await db.prepare(latestSql).all();
    const latest=(rows.results||[]).map(decode);
    const previous=latest.find(e=>e.entityType===body.entityType&&e.entityId===body.entityId);
    if((previous?.version||0)!==body.version) return Response.json({error:"Someone updated this record while you were editing. Refresh, review their change, then save again."},{status:409});
    let value:any;
    if(body.entityType==="task"||body.entityType==="milestone") {
      const work=[...plan.tasks,...gateTasks(plan)];
      const base=work.find(t=>t.id===body.entityId && (body.entityType==="task"?t.workstream!=="Delivery gate":t.workstream==="Delivery gate"));
      if(!base) return Response.json({error:"This task is not in the active plan."},{status:404});
      if(!isReviewer(user) && (body.entityType==='milestone'||base.owner!==user.owner)) return Response.json({error:'You may update only your assigned deliverables.'},{status:403});
      if(!isReviewer(user) && (body.data?.status==='Accepted'||previous?.payload.status==='Accepted')) return Response.json({error:'Only a reviewer can accept or reopen work.'},{status:403});
      if(body.data?.status==='Accepted' && base.owner===user.owner) return Response.json({error:'A different authorized reviewer must accept your own work.'},{status:403});
      const tasks=work.map(t=>({...t,...latest.find(e=>e.entityId===t.id)?.payload})) as Task[];
      const accepted=body.data?.status==='Accepted';
      const result=validateTaskUpdate(base,{...body.data,version:body.version,acceptedBy:accepted?user.displayName:'',reviewNote:accepted?(user.delegation||body.data?.reviewNote||''):body.data?.reviewNote},tasks,[...plan.people.map(p=>p.name),user.displayName]);
      if(result.error) return Response.json({error:result.error},{status:400});
      value=result.value;
      if(value.status==="Accepted") value.closedAt=previous?.payload.status==="Accepted" ? previous.payload.closedAt:new Date().toISOString();
    } else {
      if(!isReviewer(user)&&user.owner!=='Nova') return Response.json({error:'Daily results may be recorded by Nova or an authorized reviewer.'},{status:403});
      if(!plan.calendar.some(d=>d.date===body.entityId)) return Response.json({error:"Choose a date inside the project window."},{status:400});
      const result=validateMetrics(body.data);
      if(result.error) return Response.json({error:result.error},{status:400});
      value=result.value;
    }
    const at=new Date().toISOString(),version=body.version+1,id=crypto.randomUUID();
    value.version=version;value.updatedAt=at;
    try {
      await db.prepare("INSERT INTO delivery_events (id,entity_type,entity_id,version,payload,actor_id,actor_name,at) VALUES (?,?,?,?,?,?,?,?)").bind(id,body.entityType,body.entityId,version,JSON.stringify(value),user.userId,user.displayName,at).run();
    } catch(error) {
      if(String(error).includes("UNIQUE")) return Response.json({error:"Another teammate saved first. Refresh this record before saving again."},{status:409});
      throw error;
    }
    return Response.json({value,event:{id,entityType:body.entityType,entityId:body.entityId,version,payload:value,actorName:user.displayName,at}},{headers:{"Cache-Control":"no-store"}});
  } catch(error) {return failure(error);}
}
