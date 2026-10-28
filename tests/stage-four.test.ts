import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deliverableDetails,appendComment,changeComment,validateSchedule} from '../lib/stage-four.ts';
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


test('only the authenticated comment author can edit or delete, regardless of claimed identity',()=>{
 const comments=appendComment([],{text:'Original'},{id:'owner-id',name:'Shared Name'}).value!;
 const comment=comments[0];
 for(const action of ['editComment','deleteComment']){
  for(const actor of ['another-staff','reviewer','admin']){
   const result=changeComment(comments,{action,commentId:comment.id,text:'Changed',authorId:comment.authorId,authorName:comment.authorName},actor);
   assert.equal(result.status,403);
   assert.equal(result.value,undefined);
  }
 }
 const edited=changeComment(comments,{action:'editComment',commentId:comment.id,text:' Updated ',authorId:'forged',parentId:'forged',at:'forged'},comment.authorId).value!;
 assert.deepEqual(edited,[{...comment,text:'Updated'}]);
 assert.equal(comments[0].text,'Original');
 assert.deepEqual(changeComment(edited,{action:'deleteComment',commentId:comment.id},comment.authorId).value,[]);
});

test('comments with replies remain editable but cannot be deleted; leaf replies can be removed',()=>{
 const original=appendComment([],{text:'Parent'},{id:'a',name:'A'}).value!;
 const parent=original[0];
 const thread=appendComment(original,{text:'Reply',parentId:parent.id},{id:'b',name:'B'}).value!;
 const reply=thread[1];
 assert.equal(changeComment(thread,{action:'deleteComment',commentId:parent.id},'a').status,400);
 const edited=changeComment(thread,{action:'editComment',commentId:parent.id,text:'Edited parent'},'a').value!;
 assert.equal(edited[0].text,'Edited parent');assert.deepEqual(edited[1],reply);
 const nested=appendComment(thread,{text:'Nested',parentId:reply.id},{id:'b',name:'B'}).value!;
 assert.equal(changeComment(nested,{action:'deleteComment',commentId:reply.id},'b').status,400);
 const removed=changeComment(thread,{action:'deleteComment',commentId:reply.id},'b').value!;
 assert.deepEqual(removed,original);
 assert.deepEqual(changeComment(removed,{action:'deleteComment',commentId:parent.id},'a').value,[]);
});

test('comment changes reject missing comments, unsupported actions, and invalid text',()=>{
 const comments=appendComment([],{text:'Original'},{id:'a',name:'A'}).value!;
 for(const text of ['', '   ', 'x'.repeat(4001), null, 42])assert.equal(changeComment(comments,{action:'editComment',commentId:comments[0].id,text},'a').status,400);
 assert.equal(changeComment(comments,{action:'deleteComment',commentId:'missing'},'a').status,404);
 assert.equal(changeComment(comments,{action:'unknown',commentId:comments[0].id},'a').status,400);
 assert.equal(changeComment(comments,{action:'editComment',commentId:comments[0].id,text:'x'.repeat(4000)},'a').value?.[0].text.length,4000);
});
