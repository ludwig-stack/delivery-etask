import {env} from 'cloudflare:workers';
import {getSessionUser} from '../../../lib/auth';
import manifest from '../../data/import-manifest.json';
export async function GET() {
  const user=await getSessionUser();
  if(!user) return Response.json({error:'Sign in first.'},{status:401});
  if(user.role!=='reviewer'&&user.role!=='admin') return Response.json({error:'Reviewer or administrator access required.'},{status:403});
  if(!env.DB) return Response.json({error:'Database unavailable.'},{status:503});
  const events=await env.DB.prepare('SELECT * FROM delivery_events ORDER BY at, entity_type, entity_id, version').all();
  return Response.json({schema:'dsi-events-backup/1',exportedAt:new Date().toISOString(),planManifest:manifest,events:events.results},{headers:{'Content-Disposition':'attachment; filename="DSI_full_history.json"','Cache-Control':'private, no-store'}});
}
