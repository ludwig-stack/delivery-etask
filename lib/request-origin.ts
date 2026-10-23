// Next.js may reconstruct request.url with an internal hostname. Use the actual
// HTTP Host for browser-origin checks, and never trust X-Forwarded-Host here.
export function sameOrigin(request:Request) {
  const origin=request.headers.get('origin');
  if(!origin) return false;
  try {
    const source=new URL(origin),target=new URL(request.url);
    const host=request.headers.get('host')||target.host;
    return source.origin===origin&&source.host===host&&source.protocol===target.protocol;
  } catch {return false;}
}
