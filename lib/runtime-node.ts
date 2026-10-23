import path from 'node:path';
import {JsonStore} from './json-store.ts';
export const runtimeEnv=process.env;
export function getStore():JsonStore {
 if(process.env.VERCEL)throw new Error('A local JSON database requires a persistent Node server. Vercel storage cannot retain database writes.');
 const file=path.resolve(/*turbopackIgnore: true*/ process.env.DSI_DATA_PATH||'.data/delivery.json');
 const publicRoot=path.resolve('public');
 if(file===publicRoot||file.startsWith(publicRoot+path.sep))throw new Error('The private JSON database must be outside public/.');
 return new JsonStore(file);
}
