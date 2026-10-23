import {SqliteStore} from '../../lib/sqlite-store.ts';
import {randomUUID} from 'node:crypto';
const store=new SqliteStore(process.argv[2]);
for(let i=0;i<5;i++)await store.commitEvent(latest=>({id:randomUUID(),entity_type:'task',entity_id:'T0003',version:(latest.find(e=>e.entity_id==='T0003')?.version||0)+1,payload:'{"status":"Review"}',actor_id:'test',actor_name:'Test',at:new Date().toISOString()}));
