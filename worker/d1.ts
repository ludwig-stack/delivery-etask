import {D1Store,StoreConflict,type EventRow} from '../lib/d1-store.ts';
type Env={DB:D1Database;D1_WORKER_SECRET:string};
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
async function authorized(request:Request,secret:string){
 if(!secret||secret.length<32)return false;
 const supplied=request.headers.get('Authorization')||'';
 if(supplied.length>1024)return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
 const expected=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`Bearer ${secret}`));
 return crypto.subtle.verify('HMAC',key,expected,new TextEncoder().encode(supplied));
}
const worker={
 async fetch(request:Request,env:Env):Promise<Response>{
  if(!await authorized(request,env.D1_WORKER_SECRET))return json({code:'UNAUTHORIZED'},401);
  if(request.method!=='POST')return json({code:'METHOD_NOT_ALLOWED'},405);
  const operation=new URL(request.url).pathname;
  if(!['/read','/commit','/login','/import'].includes(operation))return json({code:'NOT_FOUND'},404);
  try{
   // Bound memory before parsing a request, including chunked bodies.
   const reader=request.body?.getReader();if(!reader)return json({code:'INVALID_REQUEST'},400);
   const chunks:Uint8Array[]=[];let size=0;
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>5_000_000){await reader.cancel();return json({code:'IMPORT_TOO_LARGE'},413);}chunks.push(value);}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   const body=JSON.parse(new TextDecoder().decode(bytes));
   const store=new D1Store(env.DB);
   if(operation==='/read')return json(await store.read());
   if(operation==='/commit'){await store.append(body.revision,body.event as EventRow);return json({ok:true});}
   if(operation==='/login')return json(await store.recordLoginAttempt(body.identifier));
   await store.importData(body.data);return json({ok:true});
  }catch(error){
   const message=error instanceof Error?error.message:'';
   if(error instanceof StoreConflict||/DSI_VERSION_CONFLICT|UNIQUE constraint failed/.test(message))return json({code:'CONFLICT'},409);
   if(/import_guard/.test(message))return json({code:'NOT_EMPTY'},400);
   if(/no such table|schema is missing/.test(message))return json({code:'SCHEMA_MISSING'},503);
   if(/exceeds the supported/.test(message))return json({code:'IMPORT_TOO_LARGE'},413);
   if(error instanceof SyntaxError||/Invalid|Incomplete|Duplicate/.test(message))return json({code:'INVALID_REQUEST'},400);
   return json({code:'DATABASE_UNAVAILABLE'},503);
  }
 },
};
export default worker;
