import {Miniflare} from 'miniflare';
import {build} from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function startD1(){
 const bundle=await build({entryPoints:[path.resolve('worker/d1.ts')],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',plugins:[{
  name:'workspace-source',setup(builder){
   builder.onResolve({filter:/.*/},args=>({path:path.resolve(args.importer?path.dirname(args.importer):process.cwd(),args.path),namespace:'source'}));
   builder.onLoad({filter:/.*/,namespace:'source'},async args=>({contents:await fs.readFile(args.path,'utf8'),loader:'ts'}));
  },
 }]});
 const key='local-d1-test-secret-at-least-32-characters';
 const mf=new Miniflare({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-05-22',d1Databases:{DB:'test-db'},bindings:{D1_WORKER_SECRET:key},host:'127.0.0.1',port:0});
 const db=await mf.getD1Database('DB');
 const migrations=[];
 for(const file of ['0000_brief_taskmaster.sql','0001_auth_attempts.sql','0002_d1_store.sql']){
  const sql=(await fs.readFile(new URL(`../../drizzle/${file}`,import.meta.url),'utf8')).replace(/^--.*$/gm,'');
  const [ordinary,...triggers]=sql.split(/(?=CREATE TRIGGER)/);
  const statements=[...ordinary.split(';').filter(s=>s.trim()),...triggers];
  migrations.push(...statements);
  for(const statement of statements)await db.prepare(statement).run();
 }
 const url=(await mf.ready).origin;
 return {db,key,url,migrations,close:()=>mf.dispose()};
}

