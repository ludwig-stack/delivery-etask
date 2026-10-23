import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateTaskUpdate,validateMetrics,gateTasks,type Plan,type Task} from '../lib/delivery.ts';
const plan=JSON.parse(fs.readFileSync(new URL('../app/data/plan.json',import.meta.url),'utf8')) as Plan;
test('current schedule reconciles stable IDs, inactive support, social mix and DST',()=>{
 assert.equal(plan.tasks.length,494);assert.equal(new Set(plan.tasks.map(t=>t.id)).size,494);
 assert.equal(plan.calendar.length,60);assert.equal(plan.calendar[59].date,'2026-12-20');
 assert.equal(plan.milestones.length,21);assert.equal(plan.people.length,15);
 assert.equal(plan.proposedTasks.length,80);assert(plan.proposedTasks.every((t:any)=>t.active===false&&t.owner===null));
 assert.deepEqual(Object.fromEntries(['Engage','Educate','Promote'].map(c=>[c,plan.socialCalendar.filter((p:any)=>p.category===c).length])),{Engage:10,Educate:6,Promote:4});
 const ids=new Set([...plan.tasks,...plan.milestones].map(t=>t.id));
 for(const t of plan.tasks){for(const id of t.dependencies||[])assert(ids.has(id));if(/^\d{2}:\d{2}$/.test(String(t.officeStart)))assert(t.dueTime!>=String(t.officeStart));assert.equal(t.actual,null);}
 assert(plan.tasks.find(t=>t.date==='2026-10-30')?.dueAt?.toString().endsWith('-07:00'));
 assert(plan.tasks.find(t=>t.date==='2026-11-02')?.dueAt?.toString().endsWith('-08:00'));
 for(const d of ['2026-11-26','2026-11-27','2026-12-19','2026-12-20'])assert.equal(plan.tasks.filter(t=>t.date===d).length,0);
 assert.equal(gateTasks(plan)[0].dueTime,'22:00');
});
const task=plan.tasks.find(t=>!t.dependencies?.length)!;
const input={...task,version:0,status:'Accepted',actual:1,evidence:'CQL:test-123',acceptedBy:'Wyline'};
const people=plan.people.map(p=>p.name);
test('acceptance requires evidence, measured output, reviewer and prerequisites',()=>{
 assert.equal(validateTaskUpdate(task,input,plan.tasks,people).error,undefined);
 assert(validateTaskUpdate(task,{...input,evidence:''},plan.tasks,people).error);
 assert(validateTaskUpdate(task,{...input,actual:''},plan.tasks,people).error);
 assert(validateTaskUpdate(task,{...input,acceptedBy:'Joey'},plan.tasks,people).error);
 assert(validateTaskUpdate({...task,dependencies:['missing']},input,plan.tasks,people).error);
 assert(validateTaskUpdate(task,{...input,version:-1},plan.tasks,people).error);
});
test('blocked work requires a full recovery plan and preserves original commitment',()=>{
 const draft={...input,status:'Blocked',blocker:'Missing approval',rescueOwner:'Nova',recoveryDate:'2026-10-28'};
 assert.equal(validateTaskUpdate(task,draft,plan.tasks,people).error,undefined);
 for(const key of ['blocker','rescueOwner','recoveryDate'])assert(validateTaskUpdate(task,{...draft,[key]:''},plan.tasks,people).error);
 assert(validateTaskUpdate(task,{...draft,recoveryDate:'2026-02-30'},plan.tasks,people).error);
 assert.equal(task.originalDueDate,task.date);
});
test('metric blank differs from measured zero; rates and attribution stay coherent',()=>{
 const result=validateMetrics({evidence:'CQL:report',booked:0,held:''});
 assert.equal(result.value?.booked,0);assert.equal(result.value?.held,null);
 for(const invalid of [{booked:1,referralBookings:1,linkedinBookings:1},{booked:1.5},{held:3,appointmentsDue:2},{positiveReplies:2,humanReplies:1},{repliesWithin15:1,repliesDue:0}])assert(validateMetrics({...invalid,evidence:'CQL:report'}).error);
 assert(validateMetrics({booked:0}).error);
});
