import {test} from 'node:test';
import assert from 'node:assert/strict';
import {passwordStrength,mentionedOwners,notificationsFor,validateNewTask,safeProfile,validImage} from '../lib/stage-one.ts';
import type {Plan} from '../lib/delivery.ts';
import type {EventRow} from '../lib/store-events.ts';
test('password rules reject predictable and short passwords and accept generated strength',()=>{
 for(const p of ['abc','Password123!','AAAAabcd1234!','abcdefghijklmno'])assert.equal(passwordStrength(p),'weak');
 assert.equal(passwordStrength('MangoCedar27!'),'medium');assert.equal(passwordStrength('Mango-Cedar-27!Cloud'),'strong');
});
test('mentions match entire names, canonical tokens, and do not tag unrelated names',()=>{
 assert.deepEqual(mentionedOwners('Hello @[Joey] and @Nova, see @Novaline',['Joey','Nova','No']),['Joey','Nova']);
 assert.deepEqual(mentionedOwners('Ask @Mary Jane.',['Mary Jane','Mary']),['Mary Jane','Mary']);
 assert.deepEqual(mentionedOwners('someone@example.com',['example']),[]);
});
test('notifications retain full assignment and mention history without repeat-save duplicates',()=>{
 const row=(v:number,p:Record<string,unknown>):EventRow=>({id:`e${v}`,entity_type:'task',entity_id:'CUSTOM-1',version:v,payload:JSON.stringify(p),actor_id:'admin',actor_name:'Admin',at:`2026-10-24T00:0${v}:00Z`});
 const initial={custom:true,owner:'Joey',title:'New task',acceptance:'Ask @[Nova]',notes:'',evidence:''};
 const events=[row(1,initial),row(2,{...initial,notes:'Ask @[Joey]'}),row(3,{...initial,notes:'Ask @[Joey]',evidence:'https://example.com'})];
 assert.equal(notificationsFor(events,'Joey',[]).length,2);
 assert.equal(notificationsFor(events,'Nova',[]).length,1);
 assert.equal(notificationsFor(events,'Wyline',[]).length,0);
 const named=row(1,{notes:'Ask @reviewer',mentionRecipients:{notes:['reviewer-account']}});
 assert.equal(notificationsFor([named],'Wyline',[],'reviewer-account').length,1);
 assert.equal(notificationsFor([named],'Wyline',[],'director-account').length,0);
});
test('new tasks validate plan dates, known owners, targets and required acceptance',()=>{
 const plan={people:[{name:'Joey'}],calendar:[{date:'2026-10-24'}]} as unknown as Plan;
 const input={title:'Deliver',deliverable:'Output',acceptance:'QA approved',owner:'Joey',workstream:'Build',date:'2026-10-24',target:0};
 assert.equal(validateNewTask(input,plan).value?.target,0);
 for(const patch of [{owner:'Impersonated'},{date:'2027-01-01'},{acceptance:''},{target:-1},{workstream:'Delivery gate'}])assert(validateNewTask({...input,...patch},plan).error);
});
test('public profiles remove credentials and images reject active content and oversized payloads',()=>{
 assert.deepEqual(safeProfile({name:'Joey',passwordHash:'secret',salt:'secret'}),{name:'Joey'});
 assert(validImage(''));assert(validImage('data:image/png;base64,AAAA'));
 assert(!validImage('data:image/svg+xml;base64,AAAA'));assert(!validImage('https://example.com/image.png'));
 assert(!validImage('data:image/png;base64,'+'A'.repeat(350000)));
});
