import { getDatabase } from '@delivery/runtime';
import {authConfig,passwordMatches,issueSession,sameOrigin} from '../../../../lib/auth';
export async function POST(request:Request) {
  if(!sameOrigin(request)) return Response.json({error:'Use the sign-in form on this site.'},{status:403});
  try {
    const body=await request.json() as {email?:string;password?:string};
    if(typeof body.email!=='string'||typeof body.password!=='string'||body.email.length>254||body.password.length>200) return Response.json({error:'Enter your email and password.'},{status:400});
    const {users}=authConfig();
    const db=await getDatabase();
    const identifier=body.email.trim().toLowerCase();
    const since=new Date(Date.now()-15*60*1000).toISOString();
    // Persist the limit so refreshing or restarting cannot bypass it.
    const count=await db.prepare('SELECT COUNT(*) AS attempts FROM auth_attempts WHERE identifier=? AND at>?').bind(identifier,since).first<{attempts:number}>();
    if((count?.attempts||0)>=8) return Response.json({error:'Too many attempts. Try again in 15 minutes.'},{status:429});
    await db.prepare('INSERT INTO auth_attempts (identifier,at) VALUES (?,?)').bind(identifier,new Date().toISOString()).run();
    const account=users.find(u=>u.email.toLowerCase()===identifier);
    const valid=await passwordMatches(account||users[0],body.password);
    if(!account||!valid) return Response.json({error:'Email or password is incorrect.'},{status:401});
    return Response.json({ok:true},{headers:{'Set-Cookie':await issueSession(account,new URL(request.url).protocol==='https:'),'Cache-Control':'no-store'}});
  } catch {return Response.json({error:'Sign-in is not configured. Complete the local setup or contact your administrator.'},{status:503});}
}
