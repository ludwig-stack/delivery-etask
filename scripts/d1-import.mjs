import fs from 'node:fs';
import path from 'node:path';
import nextEnv from '@next/env';
import {getStore} from '../lib/runtime-node.ts';
import {SqliteStore} from '../lib/sqlite-store.ts';
nextEnv.loadEnvConfig(process.cwd(),process.env.NODE_ENV!=='production');
const input=process.argv[2]||(fs.existsSync('.data/delivery.sqlite')?'.data/delivery.sqlite':'.data/delivery.json');
if(!fs.existsSync(input))throw new Error('Choose an existing SQLite file or full-history JSON backup.');
if(fs.existsSync(input+'.lock'))throw new Error('Stop the old JSON app and inspect its writer lock before migration.');
const sqlite=['.sqlite','.db'].includes(path.extname(input));
const original=sqlite?await new SqliteStore(input).read():JSON.parse(fs.readFileSync(input,'utf8'));
const store=getStore();
if(original.schema==='dsi-events-backup/1')await store.restoreEvents(original.events);
else if(['dsi-json-store/1','dsi-sqlite-store/1'].includes(original.schema))await store.importData({...original,schema:'dsi-json-store/1'});
else throw new Error('Unsupported backup format. Choose a local SQLite database or complete event export.');
console.log(`Imported ${original.events.length} events into D1. Original file preserved. Existing remote data was not overwritten.`);

