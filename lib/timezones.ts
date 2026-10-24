export const USER_TIMEZONES = [
  {value:'PST',label:'PST · Pacific Standard Time (UTC−8)',zone:'Etc/GMT+8'},
  {value:'PDT',label:'PDT · Pacific Daylight Time (UTC−7)',zone:'Etc/GMT+7'},
  {value:'PHT',label:'PHT · Philippine Time (UTC+8)',zone:'Asia/Manila'},
] as const;
export type UserTimezone=typeof USER_TIMEZONES[number]['value'];
export function isUserTimezone(value:unknown):value is UserTimezone {
  return USER_TIMEZONES.some(t=>t.value===value);
}
export function userTimezone(value:unknown):UserTimezone {return isUserTimezone(value)?value:'PST';}
export function userDateTime(value:Date|string,timezone:UserTimezone) {
  const date=typeof value==='string'?new Date(value):value;
  const timeZone=USER_TIMEZONES.find(t=>t.value===timezone)!.zone;
  return {
    date:new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'short',day:'numeric'}).format(date),
    time:new Intl.DateTimeFormat('en-US',{timeZone,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true}).format(date),
  };
}
export function userTimestamp(value:Date|string,timezone:UserTimezone) {
  const formatted=userDateTime(value,timezone);
  return `${formatted.date} · ${formatted.time} ${timezone}`;
}
