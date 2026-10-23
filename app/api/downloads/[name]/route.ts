import {getSessionUser} from '../../../../lib/auth';
import files from '../../../data/private-downloads.json';
export async function GET(_request:Request,{params}:{params:Promise<{name:string}>}) {
  if(!await getSessionUser()) return new Response('Sign in to download planning files.',{status:401});
  const {name}=await params;
  const entry=(files as Record<string,{type:string;data:string}>)[name];
  if(!entry) return new Response('File not found',{status:404});
  const data=Uint8Array.from(atob(entry.data),c=>c.charCodeAt(0));
  return new Response(data,{headers:{'Content-Type':entry.type,'Content-Disposition':`attachment; filename="${name}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
