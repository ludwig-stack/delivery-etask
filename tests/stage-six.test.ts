import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deleteDeliverable,isDeleted,withoutDeleted} from '../lib/stage-six.ts';
import {notificationsFor} from '../lib/stage-one.ts';
import {canDeleteDeliverable} from '../lib/permissions.ts';
import type {Task} from '../lib/delivery.ts';
const task={id:'T1',title:'Report',owner:'Joey',workstream:'QA',date:'2026-10-25',notes:'secret',comments:[{id:'c'}],custom:true} as unknown as Task;
const actor={id:'u1',name:'Admin'};
test('only reviewers and administrators can delete a deliverable',()=>{
 for(const role of ['staff','viewer'])assert.equal(deleteDeliverable(task,role,actor).status,403);
 for(const role of ['reviewer','admin'])assert(deleteDeliverable(task,role,actor).value);
 assert(canDeleteDeliverable('admin')&&canDeleteDeliverable('reviewer')&&!canDeleteDeliverable('staff'));
 assert.equal(deleteDeliverable(task,'admin',actor,true).status,400);
});
test('the tombstone drops comments and working data but records who deleted',()=>{
 const value=deleteDeliverable(task,'admin',actor).value!;
 assert(isDeleted(value));assert.equal(value.deletedBy,'Admin');
 for(const key of ['comments','notes','evidence','acceptance'])assert(!(key in value));
});
test('dependencies on deleted deliverables are released',()=>{
 const list=[{id:'A'},{id:'B',dependencies:['A','C']},{id:'C'}];
 assert.deepEqual(withoutDeleted(list,new Set(['A'])),[{id:'B',dependencies:['C']},{id:'C'}]);
});
test('notifications for deleted deliverables are removed',()=>{
 const event=(id:string,payload:object,version:number)=>({id,entity_type:'task' as const,entity_id:'T1',version,payload:JSON.stringify(payload),actor_id:'a',actor_name:'Admin',at:'2026-10-25T00:00:00Z'});
 const live=[event('e1',{custom:true,owner:'Joey',title:'Report'},1)];
 assert.equal(notificationsFor(live,'Joey',[]).length,1);
 assert.equal(notificationsFor([...live,event('e2',{deleted:true,custom:true,owner:'Joey'},2)],'Joey',[]).length,0);
});
