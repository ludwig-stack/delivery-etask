import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deliverableDetails,appendComment,validateSchedule} from '../lib/stage-four.ts';
import {validateNewTask} from '../lib/stage-one.ts';
import type {Task,Plan} from '../lib/delivery.ts';
const plan={people:[{name:'Joey'}],calendar:['2026-10-24','2026-10-25','2026-10-26'].map(date=>({date}))} as unknown as Plan;
const task={title:'Original',acceptance:'Approved requirements',date:'2026-10-25'} as Task;
test('staff cannot overwrite protected fields; reviewers and admins can update date ranges',()=>{
 for(const role of ['staff','viewer'])for(const patch of [{title:'Changed'},{acceptance:'Changed'},{startDate:'2026-10-24'},{date:'2026-10-26'}])assert(deliverableDetails(task,patch,role,plan).error);
 for(const role of ['reviewer','admin']){
  const result=deliverableDetails(task,{title:'Changed',acceptance:'New criteria',startDate:'2026-10-24',date:'2026-10-26'},role,plan);
  assert.equal(result.value?.title,'Changed');assert.equal(result.value?.originalDueDate,task.date);
 }
 assert.equal(deliverableDetails(task,{...task,startDate:task.date},'staff',plan).value?.acceptance,task.acceptance);
 assert(deliverableDetails(task,{title:''},'admin',plan).error);
 assert(deliverableDetails(task,{startDate:'2026-10-26'},'reviewer',plan).error);
 assert(validateSchedule('2026-02-30','2026-10-26',plan));
});
test('new deliverables accept a date range and reject reversed or out of window dates',()=>{
 const input={...task,deliverable:'Output',owner:'Joey',workstream:'Build',startDate:'2026-10-24'};
 assert.equal(validateNewTask(input,plan).value?.startDate,'2026-10-24');
 assert(validateNewTask({...input,startDate:'2026-10-26'},plan).error);
 assert(validateNewTask({...input,startDate:'2026-10-23'},plan).error);
});
test('comments and replies use authenticated author and server time while preserving history',()=>{
 const result=appendComment([],{text:' First comment ',authorName:'Forged',at:'fake'},{id:'staff',name:'Staff User'});
 const first=result.value![0];assert.equal(first.authorName,'Staff User');assert.equal(first.text,'First comment');assert(Number.isFinite(Date.parse(first.at)));
 const reply=appendComment(result.value!,{text:'Reply',parentId:first.id},{id:'reviewer',name:'Reviewer'}).value!;
 assert.equal(reply.length,2);assert.equal(reply[1].parentId,first.id);assert.deepEqual(reply[0],first);
 assert(appendComment(reply,{text:' '},{id:'staff',name:'Staff'}).error);
 assert(appendComment(reply,{text:'Reply',parentId:'missing'},{id:'staff',name:'Staff'}).error);
});
