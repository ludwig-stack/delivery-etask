import {test} from 'node:test';
import assert from 'node:assert/strict';
import {accountsFromRows,accountProfile,assertUniqueIdentity,validateIdentity,type Account} from '../lib/accounts.ts';
import type {EventRow} from '../lib/store-events.ts';
const base:Account={id:'admin',name:'Existing admin',username:'admin',email:'admin@example.test',role:'admin',owner:'Wyline',passwordHash:'hash',salt:'salt'};
const row=(id:string,payload:object):EventRow=>({id:'event-'+id,entity_type:'profile',entity_id:id,version:1,payload:JSON.stringify(payload),actor_id:'admin',actor_name:'Admin',at:'2026-10-24T00:00:00Z'});
test('existing accounts stay enabled and profiles cannot override their approved role',()=>{
 assert.equal(accountsFromRows([base],[])[0].enabled,true);
 const [account]=accountsFromRows([base],[row('admin',{role:'viewer',enabled:false,sessionVersion:2,owner:'Joey'})]);
 assert.equal(account.role,'admin');assert.equal(account.enabled,false);assert.equal(account.sessionVersion,2);assert.equal(account.owner,'Joey');
});
test('registered accounts start as staff with disabled access and require stored credentials',()=>{
 const record=row('new',{registered:true,name:'New Person',username:'person',email:'person@example.test',passwordHash:'hash2',salt:'salt2',role:'admin'});
 const accounts=accountsFromRows([base],[record]);assert.equal(accounts.length,2);
 assert.equal(accounts[1].role,'staff');assert.equal(accounts[1].enabled,false);assert.equal(accounts[1].owner,'');
 assert.equal(accountsFromRows([base],[row('fake',{registered:true,enabled:true})]).length,1);
});
test('management profile output never contains password credentials',()=>{
 const record=row('admin',{passwordHash:'private-hash',salt:'private-salt',firstName:'New',timezone:'PHT'});
 const account=accountsFromRows([base],[record])[0],profile=accountProfile(account,[record]);
 assert(!('passwordHash' in profile));assert(!('salt' in profile));assert.equal(profile.timezone,'PHT');assert.equal(profile.enabled,true);
});
test('sign-up identity validation requires names/email and rejects case-insensitive duplicates',()=>{
 assert.throws(()=>validateIdentity({username:'abc',email:'abc@example.test',firstName:'',lastName:'Name'},true));
 assert.throws(()=>validateIdentity({username:'abc',email:'',firstName:'First',lastName:'Last'},true));
 assert.throws(()=>assertUniqueIdentity([base],{username:'admin',email:'other@example.test'}));
 assert.throws(()=>assertUniqueIdentity([base],{username:'other',email:'admin@example.test'}));
 assert.doesNotThrow(()=>assertUniqueIdentity([base],{username:'admin',email:'admin@example.test'},'admin'));
 const identity=validateIdentity({username:' New.User ',email:' PERSON@EXAMPLE.TEST ',firstName:' First ',lastName:' Last '},true);
 assert.deepEqual(identity,{username:'new.user',email:'person@example.test',firstName:'First',lastName:'Last'});
});
