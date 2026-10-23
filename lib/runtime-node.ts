import {D1HttpStore} from './d1-store.ts';
export const runtimeEnv=process.env;
export function getStore():D1HttpStore {
 return new D1HttpStore(process.env.D1_WORKER_URL||'',process.env.D1_WORKER_SECRET||'');
}
