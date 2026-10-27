import {validateSchedule} from './stage-four.ts';
import type {Task, Plan} from './delivery.ts';
import type {EventRow} from './store-events.ts';
export const THEMES=['default','dark','light'] as const;
export function passwordStrength(value:string) {
 const kinds=[/[a-z]/,/[A-Z]/,/[0-9]/,/[^a-zA-Z0-9]/].filter(r=>r.test(value)).length;
 if(value.length<12||kinds<3||/(.)\1{3}|password|qwerty|123456|letmein/i.test(value))return 'weak';
 return value.length>=16&&kinds===4?'strong':'medium';
}
export function validateNewTask(input:Record<string,unknown>,plan:Plan):{value?:Task;error?:string} {
 for(const field of ['title','deliverable','acceptance','owner','workstream','date'])if(typeof input[field]!=='string'||!input[field].trim())return {error:`Enter ${field}.`};
 if(!plan.people.some(p=>p.name===input.owner))return {error:'Choose an owner from the team.'};
 if(!plan.calendar.some(d=>d.date===input.date))return {error:'Choose a date inside the project window.'};
 const scheduleError=validateSchedule(input.startDate??input.date,input.date,plan);if(scheduleError)return {error:scheduleError};
 if(input.workstream==='Delivery gate')return {error:'Use an existing gate for milestone review.'};
 const text=(key:string)=>String(input[key]||'').trim();
 const target=input.target===''||input.target==null?null:Number(input.target);
 if(target!==null&&(!Number.isFinite(target)||target<0))return {error:'Target must be a nonnegative number or blank.'};
 return {value:{id:'',title:text("title").slice(0,200),deliverable:text("deliverable").slice(0,4000),acceptance:text("acceptance").slice(0,4000),owner:text("owner"),date:text("date"),startDate:String(input.startDate??input.date),originalDueDate:text("date"),workstream:text("workstream").slice(0,100),dueTime:/^([01]\d|2[0-3]):[0-5]\d$/.test(String(input.dueTime))?String(input.dueTime):'17:00',target,unit:String(input.unit||'').slice(0,100),status:'Ready',actual:null,evidence:'',notes:'',blocker:'',rescueOwner:'',recoveryDate:'',acceptedBy:'',closedAt:null,custom:true}};
}
export function mentionedOwners(text:string,names:string[]) {
 return names.filter(name=>{const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return new RegExp(`@\\[${escaped}\\](?!\\(user:)`,'i').test(text)||new RegExp(`(^|\\s)@${escaped}(?=$|[\\s,.;!?:])`,'i').test(text);});
}
export function notificationsFor(events:EventRow[],owner:string,baseTasks:Task[],recipientId?:string) {
 const previous=new Map<string,Record<string,unknown>>(); const notices:{id:string;taskId:string;kind:string;message:string;at:string}[]=[];
 const mentioned=(record:Record<string,unknown>|undefined,field:string,fallback:unknown='')=>{
  const recipients=record?.mentionRecipients as Record<string,string[]>|undefined;
  if(recipientId&&recipients&&Array.isArray(recipients[field]))return recipients[field].includes(recipientId);
  const text=String(record?.[field]??fallback);return !!(recipientId&&text.includes(`](user:${recipientId})`))||!!(owner&&mentionedOwners(text,[owner]).length);
 };
 for(const e of events){if(e.entity_type!=='task'&&e.entity_type!=='milestone')continue;
  const key=`${e.entity_type}:${e.entity_id}`,old=previous.get(key),next=JSON.parse(e.payload) as Record<string,unknown>,base=baseTasks.find(t=>t.id===e.entity_id);
  if(next.custom&&!old&&next.owner===owner)notices.push({id:e.id+':assigned',taskId:e.entity_id,kind:'assignment',message:`${e.actor_name} assigned you: ${next.title}`,at:e.at});
  for(const field of ['acceptance','evidence','notes'])if(mentioned(next,field)&&!mentioned(old,field,base?.[field]||''))notices.push({id:e.id+':'+field,taskId:e.entity_id,kind:'mention',message:`${e.actor_name} mentioned you in ${field==='acceptance'?'definition of done':field==='evidence'?'evidence':'working notes'}: ${next.title||base?.title||e.entity_id}`,at:e.at});
  previous.set(key,next);
 }
 return notices.reverse();
}
export function safeProfile(value:unknown) {return Object.fromEntries(Object.entries(value&&typeof value==='object'?value:{}).filter(([key])=>!['passwordHash','salt'].includes(key)));}
export function validImage(value:unknown) {return typeof value==='string'&&(value===''||(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)&&value.length<350000));}
