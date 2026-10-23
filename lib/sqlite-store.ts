import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {latestEvents, StoreConflict, validateEvents, validateStore, type EventRow, type StoreData} from './store-events.ts';

export {latestEvents, StoreConflict, type EventRow} from './store-events.ts';
export type SqliteData = Omit<StoreData, 'schema'> & {schema:'dsi-sqlite-store/1'};

// Connections are scoped to each operation, including rollback and close on failure.
// BEGIN IMMEDIATE serializes validation and writes across processes.
export class SqliteStore {
 readonly file:string;
 private readonly timeoutMs:number;
 constructor(file:string,timeoutMs=5000){this.file=path.resolve(file);this.timeoutMs=timeoutMs;}

 private initialize(){
  const staging=this.file+`-create-${process.pid}-${crypto.randomUUID()}`;
  let db:DatabaseSync|undefined;
  try{
   const descriptor=fs.openSync(staging,'wx',0o600);fs.closeSync(descriptor);
   db=new DatabaseSync(staging);
   db.exec('PRAGMA synchronous=FULL; BEGIN IMMEDIATE');
     db.exec(`
      CREATE TABLE store_metadata (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL CHECK(revision>=0), updated_at TEXT NOT NULL);
      CREATE TABLE events (
       sequence INTEGER PRIMARY KEY AUTOINCREMENT,
       id TEXT NOT NULL UNIQUE,
       entity_type TEXT NOT NULL CHECK(entity_type IN ('task','milestone','metrics')),
       entity_id TEXT NOT NULL,
       version INTEGER NOT NULL CHECK(version>=1),
       payload TEXT NOT NULL CHECK(json_valid(payload)),
       actor_id TEXT NOT NULL, actor_name TEXT NOT NULL, at TEXT NOT NULL,
       UNIQUE(entity_type,entity_id,version)
      );
      CREATE TABLE login_attempts (identifier TEXT NOT NULL, at TEXT NOT NULL);
      CREATE INDEX login_attempts_identifier_at ON login_attempts(identifier,at);
      PRAGMA user_version=1;
     `);

   db.prepare('INSERT INTO store_metadata VALUES (1,0,?)').run(new Date().toISOString());
   db.exec('COMMIT');db.close();db=undefined;
   try{fs.linkSync(staging,this.file);}
   catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
  }finally{db?.close();fs.rmSync(staging,{force:true});}
 }
 private open():DatabaseSync {
  fs.mkdirSync(path.dirname(this.file),{recursive:true});
  if(!fs.existsSync(this.file))this.initialize();
  const descriptor=fs.openSync(this.file,'r');
  try{
   const header=Buffer.alloc(16);
   if(fs.readSync(descriptor,header,0,16,0)!==16||header.toString()!=='SQLite format 3\0')throw new Error('The SQLite database is invalid. Its contents were preserved; migrate JSON files with npm run data:migrate.');
  }finally{fs.closeSync(descriptor);}
  const db=new DatabaseSync(this.file);
  try{
   db.exec(`PRAGMA busy_timeout=${Math.max(0,Math.floor(this.timeoutMs))}; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;`);
   const version=db.prepare('PRAGMA user_version').get() as {user_version:number};
   if(version.user_version!==1)throw new Error('Unsupported SQLite database version. Existing data was preserved.');
   return db;
  }catch(error){db.close();throw error;}
 }

 private transaction<T>(run:(db:DatabaseSync)=>T):T {
  const db=this.open();
  try{
   db.exec('BEGIN IMMEDIATE');
   try{const result=run(db);db.exec('COMMIT');return result;}
   catch(error){db.exec('ROLLBACK');throw error;}
  }finally{db.close();}
 }
 private events(db:DatabaseSync):EventRow[]{
  return db.prepare('SELECT id,entity_type,entity_id,version,payload,actor_id,actor_name,at FROM events ORDER BY sequence').all().map(row=>({...row})) as unknown as EventRow[];
 }
 private insert(db:DatabaseSync,event:EventRow){
  db.prepare('INSERT INTO events (id,entity_type,entity_id,version,payload,actor_id,actor_name,at) VALUES (?,?,?,?,?,?,?,?)')
   .run(event.id,event.entity_type,event.entity_id,event.version,event.payload,event.actor_id,event.actor_name,event.at);
 }
 private updated(db:DatabaseSync){db.prepare('UPDATE store_metadata SET revision=revision+1,updated_at=? WHERE id=1').run(new Date().toISOString());}
 async read():Promise<SqliteData>{
  return this.transaction(db=>{
   const metadata=db.prepare('SELECT revision,updated_at FROM store_metadata WHERE id=1').get() as {revision:number;updated_at:string};
   return {schema:'dsi-sqlite-store/1',revision:metadata.revision,updatedAt:metadata.updated_at,events:this.events(db),loginAttempts:db.prepare('SELECT identifier,at FROM login_attempts ORDER BY rowid').all().map(row=>({...row})) as {identifier:string;at:string}[]};
  });
 }
 async snapshot(){const data=await this.read();return {latest:latestEvents(data.events),audit:[...data.events].reverse().sort((a,b)=>b.at.localeCompare(a.at)).slice(0,150)};}
 async allEvents(){return (await this.read()).events;}
 async commitEvent(create:(latest:EventRow[])=>EventRow):Promise<EventRow>{
  return this.transaction(db=>{
   const events=this.events(db),latest=latestEvents(events),event=create(latest);
   const previous=latest.find(e=>e.entity_type===event.entity_type&&e.entity_id===event.entity_id);
   if(event.version!==(previous?.version||0)+1||events.some(e=>e.id===event.id))throw new StoreConflict('Someone updated this record. Refresh before saving again.');
   validateEvents([...events,event]);this.insert(db,event);this.updated(db);return event;
  });
 }
 async recordLoginAttempt(identifier:string,now=new Date()):Promise<boolean>{
  if(!Number.isFinite(now.getTime()))throw new Error('Invalid login attempt timestamp.');
  return this.transaction(db=>{
   db.prepare('DELETE FROM login_attempts WHERE julianday(at)<julianday(?)').run(new Date(now.getTime()-15*60*1000).toISOString());
   const {count}=db.prepare('SELECT count(*) AS count FROM login_attempts WHERE identifier=?').get(identifier) as {count:number};
   if(count>=8)return false;
   db.prepare('INSERT INTO login_attempts VALUES (?,?)').run(identifier,now.toISOString());this.updated(db);return true;
  });
 }
 async restoreEvents(events:EventRow[]){
  validateEvents(events);
  await this.restore({schema:'dsi-json-store/1',revision:1,updatedAt:new Date().toISOString(),events,loginAttempts:[]});
 }
 async importJson(value:unknown){validateStore(value);await this.restore(value);}
 private async restore(data:StoreData){
  fs.mkdirSync(path.dirname(this.file),{recursive:true});
  if(fs.existsSync(this.file))throw new Error('Restore requires a new destination file; existing data was preserved.');
  // Build a complete database privately, then publish it without replacing any file.
  const staging=this.file+`-import-${process.pid}-${crypto.randomUUID()}`;
  try{
   const target=new SqliteStore(staging,this.timeoutMs);
   target.transaction(db=>{
    for(const event of data.events)target.insert(db,event);
    const attempt=db.prepare('INSERT INTO login_attempts VALUES (?,?)');
    for(const row of data.loginAttempts)attempt.run(row.identifier,row.at);
    db.prepare('UPDATE store_metadata SET revision=?,updated_at=? WHERE id=1').run(data.revision,data.updatedAt);
   });
   try{fs.linkSync(staging,this.file);}
   catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')throw new Error('Restore requires a new destination file; existing data was preserved.');throw error;}
  }
  finally{fs.rmSync(staging,{force:true});}
 }
}
