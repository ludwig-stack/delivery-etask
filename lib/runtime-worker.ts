import {env} from 'cloudflare:workers';
import type {Database} from './database';
export const runtimeEnv=env as unknown as Record<string,string|undefined>;
export async function getDatabase():Promise<Database> {
  if(!env.DB) throw new Error('Missing Cloudflare D1 binding DB.');
  return env.DB as unknown as Database;
}
