import type {Task} from './delivery.ts';
import {canReview} from './permissions.ts';

export const isDeleted=(value:unknown)=>!!value&&typeof value==='object'&&(value as {deleted?:unknown}).deleted===true;

// A deleted deliverable keeps only a tombstone; comments, notes, evidence and mention data are dropped.
export function deleteDeliverable(current:Task,role:string,actor:{id:string;name:string},isGate=false) {
 if(!canReview(role))return {error:'Only administrators and reviewers can delete deliverables.',status:403};
 if(isGate)return {error:'Delivery gates cannot be deleted.',status:400};
 return {value:{deleted:true,deletedAt:new Date().toISOString(),deletedBy:actor.name,deletedById:actor.id,title:current.title,workstream:current.workstream,owner:current.owner,date:current.date,custom:!!current.custom}};
}

// Dependencies on deleted deliverables no longer block anything.
export function withoutDeleted<T extends {id:string;dependencies?:string[]}>(tasks:T[],deletedIds:Set<string>):T[] {
 return tasks.filter(t=>!deletedIds.has(t.id)).map(t=>t.dependencies?.some(id=>deletedIds.has(id))?{...t,dependencies:t.dependencies.filter(id=>!deletedIds.has(id))}:t);
}
