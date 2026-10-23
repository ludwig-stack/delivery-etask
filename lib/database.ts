export type SqlValue = string | number | null;
export type QueryResult<T=Record<string,unknown>> = {results:T[];success:boolean};
export interface Statement {
  bind(...params:SqlValue[]):Statement;
  all<T=Record<string,unknown>>():Promise<QueryResult<T>>;
  first<T=Record<string,unknown>>():Promise<T|null>;
  run():Promise<QueryResult>;
}
export interface Database {
  prepare(sql:string):Statement;
  batch(statements:Statement[]):Promise<QueryResult[]>;
}

// Keeps D1's existing SQL, event IDs, and unique version constraint on Vercel.
// Credentials stay in the server environment; the browser never calls this API.
export function createD1HttpDatabase(config:{accountId:string;databaseId:string;token:string},fetcher:typeof fetch=fetch):Database {
  if(!/^[a-f0-9]{32}$/i.test(config.accountId)||!/^[a-f0-9-]{36}$/i.test(config.databaseId)||!config.token) throw new Error('Configure valid Cloudflare D1 credentials.');
  const endpoint=`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`;
  async function query(sql:string,params:SqlValue[]) {
    const response=await fetcher(endpoint,{method:'POST',headers:{Authorization:`Bearer ${config.token}`,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),cache:'no-store',signal:AbortSignal.timeout(20000)});
    const data=await response.json() as {success?:boolean;result?:Array<QueryResult & {error?:string}>;errors?:Array<{message?:string}>};
    if(!response.ok||!data.success||!data.result?.[0]?.success) {
      const message=[...(data.errors||[]).map(e=>e.message),...(data.result||[]).map(r=>r.error)].filter(Boolean).join(' ');
      // Expose only an actionable conflict code, never provider response details.
      if(/UNIQUE constraint failed|SQLITE_CONSTRAINT_UNIQUE/i.test(message)) throw new Error('UNIQUE record version conflict');
      throw new Error(`D1 query failed (HTTP ${response.status}). Check database configuration and service availability.`);
    }
    return data.result[0];
  }
  function prepare(sql:string,params:SqlValue[]=[]):Statement {
    return {bind:(...values)=>prepare(sql,values),all:async<T>()=>await query(sql,params) as QueryResult<T>,first:async<T>()=>(await query(sql,params)).results[0] as T||null,run:()=>query(sql,params)};
  }
  return {prepare,batch:statements=>Promise.all(statements.map(s=>s.all()))};
}
