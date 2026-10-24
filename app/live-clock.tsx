'use client';
import {useEffect,useState} from 'react';
import {USER_TIMEZONES,userDateTime,userTimezone,type UserTimezone} from '../lib/timezones';
export function LiveClock({profileTimezone}:{profileTimezone:unknown}) {
  const [override,setOverride]=useState<UserTimezone|null>(null);
  const [now,setNow]=useState<Date|null>(null);
  const timezone=override||userTimezone(profileTimezone);
  useEffect(()=>{const timer=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(timer);},[]);
  const formatted=now?userDateTime(now,timezone):null;
  return <div className="live-clock" aria-label="Live date and time">
    <time dateTime={now?.toISOString()}><span>{formatted?.date||'Live date & time'}</span><strong>{formatted?.time||'—:—:— —'}</strong></time>
    <select aria-label="Clock timezone" title="Temporary clock timezone; your profile preference stays unchanged" value={timezone} onChange={e=>setOverride(userTimezone(e.target.value))}>
      {USER_TIMEZONES.map(t=><option key={t.value} value={t.value}>{t.value}</option>)}
    </select>
  </div>;
}
