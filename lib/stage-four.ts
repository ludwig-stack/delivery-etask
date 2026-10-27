import type {Plan, Task} from './delivery.ts';
import {canReview} from './permissions.ts';

export type DeliverableComment = {id:string; parentId:string|null; authorId:string; authorName:string; at:string; text:string};

export function validateSchedule(start:unknown,due:unknown,plan:Plan):string|undefined {
 if(typeof start!=='string'||typeof due!=='string'||![start,due].every(date=>plan.calendar.some(d=>d.date===date)))return 'Choose start and due dates inside the project window.';
 if(start>due)return 'Start date must be on or before the due date.';
}

export function deliverableDetails(current:Task,input:Record<string,unknown>,role:string,plan:Plan) {
 const value={title:current.title,acceptance:current.acceptance,startDate:String(current.startDate||current.date),date:current.date,originalDueDate:current.originalDueDate||current.date};
 for(const key of ['title','acceptance','startDate','date'] as const){
  if(input[key]===undefined)continue;
  if(!canReview(role)&&input[key]!==value[key])return {error:'Only administrators and reviewers can edit the title, definition of done, start date, or due date.'};
  if(typeof input[key]!=='string')return {error:`Enter a valid ${key}.`};
  value[key]=input[key].trim();
 }
 if(!value.title||value.title.length>200)return {error:'Enter a title of up to 200 characters.'};
 if(!value.acceptance||value.acceptance.length>4000)return {error:'Enter a definition of done of up to 4000 characters.'};
 const error=validateSchedule(value.startDate,value.date,plan);
 return error?{error}:{value};
}

export function appendComment(comments:DeliverableComment[],input:Record<string,unknown>,author:{id:string;name:string}) {
 if(typeof input.text!=='string'||!input.text.trim()||input.text.trim().length>4000)return {error:'Enter a comment of up to 4000 characters.'};
 const parentId=input.parentId==null?null:input.parentId;
 if(parentId!==null&&(typeof parentId!=='string'||!comments.some(c=>c.id===parentId)))return {error:'The comment you are replying to could not be found. Refresh and try again.'};
 const comment:DeliverableComment={id:crypto.randomUUID(),parentId,authorId:author.id,authorName:author.name,at:new Date().toISOString(),text:input.text.trim()};
 return {value:[...comments,comment]};
}
