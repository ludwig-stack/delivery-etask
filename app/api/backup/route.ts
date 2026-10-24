import {getStore} from '@delivery/runtime';
import {getSessionUser} from '../../../lib/auth';
import manifest from '../../data/import-manifest.json';
export async function GET() {
  const user=await getSessionUser();
  if(!user) return Response.json({error:'Sign in first.'},{status:401});
  if(user.role!=='reviewer'&&user.role!=='admin') return Response.json({error:'Reviewer or administrator access required.'},{status:403});
  let events;
  try {events=(await getStore().allEvents()).filter(e=>user.role==='admin'||['task','milestone','metrics'].includes(e.entity_type));}
  catch {return Response.json({error:'Database unavailable. Check the server database configuration.'},{status:503});}
  return Response.json({schema:'dsi-events-backup/1',historyScope:user.role==='admin'?'All events, including private account recovery data':'Complete delivery history; private account settings excluded',exportedAt:new Date().toISOString(),planManifest:manifest,events},{headers:{'Content-Disposition':'attachment; filename="DSI_full_history.json"','Cache-Control':'private, no-store'}});
}
