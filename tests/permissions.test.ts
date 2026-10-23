import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canReview,canEditTask,canAcceptTask,canRecordMetrics} from '../lib/permissions.ts';
test('administrators control every owner, accepted task, gate and results',()=>{
 assert(canReview('admin'));
 for(const owner of ['Marco','Joey','Wyline']){
  assert(canEditTask('admin','Marco',owner,'Accepted',true));
  assert(canAcceptTask('admin','Marco',owner));
 }
 assert(canRecordMetrics('admin',''));
});
test('staff, reviewer and viewer restrictions remain enforced',()=>{
 assert(!canAcceptTask('reviewer','Wyline','Wyline'));
 assert(canAcceptTask('reviewer','Wyline','Joey'));
 assert(canEditTask('staff','Joey','Joey','Review',false));
 assert(!canEditTask('staff','Joey','Nova','Review',false));
 assert(!canEditTask('staff','Joey','Joey','Accepted',false));
 assert(!canEditTask('staff','Joey','Joey','Review',true));
 assert(!canAcceptTask('staff','Joey','Nova'));
 assert(canRecordMetrics('staff','Nova'));
 assert(!canRecordMetrics('staff','Joey'));
 assert(!canEditTask('viewer','','Joey','Ready',false));
 assert(!canRecordMetrics('viewer','Nova'));
});
