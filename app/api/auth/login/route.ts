import { getStore } from '@delivery/runtime';
import {AuthConfigurationError,resolvedAccounts,passwordMatches,issueSession,sameOrigin} from '../../../../lib/auth';
export async function POST(request:Request) {
  if(!sameOrigin(request)) return Response.json({error:'Use the sign-in form on this site.'},{status:403});
  try {
    const body=await request.json() as {email?:string;password?:string};
    if(typeof body.email!=='string'||typeof body.password!=='string'||body.email.length>254||body.password.length>200) return Response.json({error:'Enter your email or username and password.'},{status:400});
    const identifier=body.email.trim().toLowerCase();
    if(!await getStore().recordLoginAttempt(identifier)) return Response.json({error:'Too many attempts. Try again in 15 minutes.'},{status:429});
    const users=await resolvedAccounts();
    const account=users.find(u=>u.email?.toLowerCase()===identifier||u.username?.toLowerCase()===identifier);
    const valid=await passwordMatches(account||users[0],body.password);
    if(!account||!valid) return Response.json({error:'Email, username, or password is incorrect.'},{status:401});
    if(account.enabled===false)return Response.json({error:'Your account is disabled or awaiting approval. Contact an administrator or reviewer.'},{status:403});
    return Response.json({ok:true},{headers:{'Set-Cookie':await issueSession(account,new URL(request.url).protocol==='https:'),'Cache-Control':'no-store'}});
  } catch(error) {
    console.error('Sign-in unavailable',error instanceof Error?error.message:'unknown');
    return Response.json({error:error instanceof AuthConfigurationError
      ?'Sign-in is not configured for this environment. Contact your workspace administrator.'
      :'Sign-in is temporarily unavailable. Please try again or contact your workspace administrator.'},{status:503});
  }
}
