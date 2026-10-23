import {PGlite} from '@electric-sql/pglite';
import {createServer} from 'node:http';
import fs from 'node:fs/promises';

// Real PostgreSQL SQL/permissions, with a small local HTTP adapter for the
// PostgREST RPC contract. No remote credentials or databases are used by tests.
export async function startSupabase(){
 const db=new PGlite();
 await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;');
 const migration=await fs.readFile(new URL('../../supabase/migrations/202610230001_delivery_store.sql',import.meta.url),'utf8');
 await db.exec(migration);
 const key='sb_secret_test-only',requests=[];
 const functions={dsi_read_store:[],dsi_commit_event:['p_revision','p_event'],dsi_record_login_attempt:['p_identifier'],dsi_import_store:['p_data']};
 const server=createServer(async(req,res)=>{
  requests.push({path:req.url,authorization:req.headers.authorization,apikey:req.headers.apikey});
  if(req.headers.apikey!==key){res.writeHead(401);res.end('{}');return;}
  const name=req.url?.split('/').at(-1),parameters=functions[name];
  if(!parameters){res.writeHead(404);res.end(JSON.stringify({code:'PGRST202'}));return;}
  try{
   let text='';for await(const chunk of req)text+=chunk;
   const body=JSON.parse(text||'{}');
   const args=parameters.map((parameter,index)=>`${parameter} => $${index+1}`).join(',');
   const result=await db.transaction(async tx=>{
    await tx.exec('SET LOCAL ROLE service_role');
    return tx.query(`SELECT public.${name}(${args}) AS value`,parameters.map(parameter=>typeof body[parameter]==='object'?JSON.stringify(body[parameter]):body[parameter]));
   });
   if(['dsi_commit_event','dsi_import_store'].includes(name)){res.writeHead(204);res.end();}
   else {res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result.rows[0].value));}
  }catch(error){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({code:error.code||'XX000'}));}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}`;
 return {db,url,key,requests,migration,close:async()=>{await new Promise(resolve=>server.close(resolve));await db.close();}};
}
