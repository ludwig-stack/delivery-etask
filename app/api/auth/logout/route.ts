import {clearSession,sameOrigin} from '../../../../lib/auth';
export async function POST(request:Request) {
  if(!sameOrigin(request)) return new Response('Forbidden',{status:403});
  return new Response(null,{status:303,headers:{Location:'/login','Set-Cookie':clearSession(new URL(request.url).protocol==='https:')}});
}
