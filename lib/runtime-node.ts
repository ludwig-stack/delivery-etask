import path from 'node:path';
import fs from 'node:fs';
import {SqliteStore} from './sqlite-store.ts';
export const runtimeEnv=process.env;
export function getStore():SqliteStore {
 if(process.env.VERCEL)throw new Error('A local SQLite database requires a persistent Node server. Vercel storage cannot retain database writes.');
 const file=path.resolve(/*turbopackIgnore: true*/ process.env.DSI_DATA_PATH||'.data/delivery.sqlite');
 if(!process.env.DSI_DATA_PATH&&!fs.existsSync(file)&&fs.existsSync('.data/delivery.json'))throw new Error('Existing JSON data found. Run npm run data:migrate before starting SQLite.');
 if(path.extname(file).toLowerCase()==='.json')throw new Error('Migrate the JSON database with npm run data:migrate, then set DSI_DATA_PATH to the .sqlite destination.');
 const publicRoot=path.resolve('public');
 if(file===publicRoot||file.startsWith(publicRoot+path.sep))throw new Error('The private SQLite database must be outside public/.');
 return new SqliteStore(file);
}
