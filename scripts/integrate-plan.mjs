import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// Planning fields are merged by stable ID. Live events are never touched.
const input = process.argv[2] || '.handoff/current-plan/DSI_60_Day_Plan.json';
const raw = fs.readFileSync(input, 'utf8');
const incoming = JSON.parse(raw);
const old = JSON.parse(fs.readFileSync('app/data/plan.json', 'utf8'));
const support = incoming.tasks.filter(t => t.assignmentState === 'Proposed assignment');
const core = incoming.tasks.filter(t => t.assignmentState !== 'Proposed assignment');
assert.equal(core.length, 494);
assert.equal(support.length, 80);
assert.equal(incoming.calendar.length, 60);
assert.equal(incoming.milestones.length, 21);
assert.equal(incoming.people.length, 15);
assert.equal(incoming.socialCalendar.length, 20);
assert.deepEqual([...new Set(core.map(t => t.id))].sort(), old.tasks.map(t => t.id).sort());
const ids = new Set([...core, ...incoming.milestones].map(t => t.id));
for (const t of core) {
  for (const id of t.dependencies || []) assert(ids.has(id), `${t.id}: missing ${id}`);
  if (/^\d{2}:\d{2}$/.test(t.officeStart || '')) assert(t.dueTime >= t.officeStart, `${t.id}: due before office start`);
}
const progress = ['status','actual','evidence','blocker','helpNeeded','rescueOwner','recoveryDate','acceptedBy','closedAt','acceptedAt','version','updatedAt','reviewNote'];
const defaults = {status:'Ready',actual:null,evidence:'',blocker:'',helpNeeded:'',rescueOwner:'',recoveryDate:'',acceptedBy:'',closedAt:null,version:0};
const tasks = core.map(t => {
  const previous = old.tasks.find(o => o.id === t.id);
  const preserved = Object.fromEntries(progress.filter(k => previous?.[k] !== undefined).map(k => [k, previous[k]]));
  return {...t,...defaults,...preserved,originalDueDate:previous?.originalDueDate || t.originalDueDate,originalDueTime:previous?.originalDueTime || previous?.dueTime || t.originalDueTime};
});
const plan = {...incoming,tasks,proposedTasks:support.map(t => ({...t,active:false,owner:null,proposedOwner:t.owner})),calendar:incoming.calendar.map(d => {
  const dayTasks=tasks.filter(t=>t.date===d.date);
  return {...d,taskIds:dayTasks.map(t=>t.id),taskCount:dayTasks.length,plannedHours:dayTasks.reduce((sum,t)=>sum+(t.estimateHours||0),0)};
}),meta:{...incoming.meta,deliveryMode:'Current 60-day planning baseline integrated; live progress is stored separately',downloads:[
  {label:'Current 60-day plan · JSON',href:'/api/downloads/DSI_60_Day_Plan.json'},
  {label:'Current load files · ZIP',href:'/api/downloads/DSI_60_Day_Load_Files.zip'},
  {label:'Core assignments · CSV',href:'/api/downloads/DSI_Core_Tasks_494.csv'},
  {label:'Field mapping · CSV',href:'/api/downloads/DSI_Field_Mapping.csv'}
]}};
fs.writeFileSync('app/data/plan.json',JSON.stringify(plan,null,2)+'\n');
fs.mkdirSync('data/downloads',{recursive:true});
for(const file of ['DSI_60_Day_Plan.json','DSI_Core_Tasks_494.csv','DSI_Field_Mapping.csv']) fs.copyFileSync(`.handoff/current-plan/${file}`,`data/downloads/${file}`);
fs.copyFileSync('.handoff/plan.zip','data/downloads/DSI_60_Day_Load_Files.zip');
fs.writeFileSync('app/data/import-manifest.json',JSON.stringify({schema:'dsi-plan-integration/1',sourceVersion:incoming.meta.version,sha256:crypto.createHash('sha256').update(raw).digest('hex'),counts:{core:tasks.length,inactiveSupport:support.length,dates:60,gates:21,people:15,social:20},progressPolicy:'Preserve existing progress by stable ID; never write delivery_events during plan integration.'},null,2)+'\n');
console.log('Integrated 494 stable tasks, 80 inactive proposals, 60 dates, 21 gates, 15 roles, 20 social posts.');
