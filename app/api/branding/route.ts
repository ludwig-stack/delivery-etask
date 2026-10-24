import {getStore} from '@delivery/runtime';
export async function GET(){try{const {latest}=await getStore().snapshot();const row=latest.find(e=>e.entity_type==='settings'&&e.entity_id==='workspace');const p=row?JSON.parse(row.payload):{};return Response.json({logo:p.logo||'',workspaceName:p.workspaceName||'Daily Delivery'});}catch{return Response.json({logo:'',workspaceName:'Daily Delivery'});}}
