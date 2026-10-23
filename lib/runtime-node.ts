import {createD1HttpDatabase,type Database,type QueryResult,type SqlValue,type Statement} from './database.ts';
export const runtimeEnv=process.env;
let local:Promise<Database>|undefined;
export async function getDatabase():Promise<Database> {
  const {CLOUDFLARE_ACCOUNT_ID,CLOUDFLARE_D1_DATABASE_ID,CLOUDFLARE_D1_API_TOKEN}=process.env;
  if(CLOUDFLARE_ACCOUNT_ID||CLOUDFLARE_D1_DATABASE_ID||CLOUDFLARE_D1_API_TOKEN) {
    return createD1HttpDatabase({accountId:CLOUDFLARE_ACCOUNT_ID||'',databaseId:CLOUDFLARE_D1_DATABASE_ID||'',token:CLOUDFLARE_D1_API_TOKEN||''});
  }
  if(process.env.VERCEL) throw new Error('Configure CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID and CLOUDFLARE_D1_API_TOKEN in Vercel. Local SQLite is disabled on Vercel.');
  local ??= openLocalDatabase();
  return local;
}
async function openLocalDatabase():Promise<Database> {
  const [{DatabaseSync},fs,path]=await Promise.all([import('node:sqlite'),import('node:fs'),import('node:path')]);
  const legacyDir=path.resolve('.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
  const candidates=fs.existsSync(legacyDir)?fs.readdirSync(legacyDir).filter(f=>f.endsWith('.sqlite')&&f!=='metadata.sqlite'):[];
  if(!process.env.DSI_SQLITE_PATH&&candidates.length>1) throw new Error('Multiple local D1 databases found. Set DSI_SQLITE_PATH to the intended database.');
  const file=process.env.DSI_SQLITE_PATH?path.resolve(process.env.DSI_SQLITE_PATH):candidates.length===1?path.join(legacyDir,candidates[0]):path.resolve('.data/delivery.sqlite');
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const sqlite=new DatabaseSync(file);
  sqlite.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
  sqlite.exec(fs.readFileSync(path.resolve('scripts/local-schema.sql'),'utf8'));
  function prepare(sql:string,params:SqlValue[]=[]):Statement {
    const all=async<T=Record<string,unknown>>():Promise<QueryResult<T>>=>({success:true,results:sqlite.prepare(sql).all(...params) as T[]});
    return {bind:(...values)=>prepare(sql,values),all,first:async<T>()=>sqlite.prepare(sql).get(...params) as T||null,run:async()=>{sqlite.prepare(sql).run(...params);return {success:true,results:[]};}};
  }
  return {prepare,batch:statements=>Promise.all(statements.map(s=>s.all()))};
}
