export const STATUSES = ["Ready", "In progress", "Blocked", "Review", "Accepted", "Deferred"] as const;
export type Status = typeof STATUSES[number];
export type Task = {
  id: string; date: string; originalDueDate?: string; dueTime?: string;
  owner: string; support?: string[] | string; workstream: string; title: string;
  deliverable: string; target: number | string | null; unit?: string;
  estimateHours?: number; dependencies?: string[]; acceptance: string;
  status: Status; actual: number | null; evidence: string; blocker: string;
  rescueOwner: string; recoveryDate: string; acceptedBy: string;
  closedAt: string | null; version?: number; updatedAt?: string;
  reviewNote?: string; notes?: string; [key: string]: unknown;
};
export type Plan = {
  meta: Record<string, any>; people: Record<string, any>[];
  phases: Record<string, any>[]; milestones: Record<string, any>[];
  targets: Record<string, any>[]; calendar: Record<string, any>[];
  tasks: Task[]; risks?: Record<string, any>[]; agents?: Record<string, any>[];
  sops?: Record<string, any>[]; [key: string]: any;
};
export type TaskUpdate = Pick<Task, "status"|"actual"|"evidence"|"blocker"|"rescueOwner"|"recoveryDate"|"acceptedBy"|"closedAt"> & { reviewNote: string; notes: string; version: number; updatedAt?: string };
export type Audit = {id:string; entityType:string; entityId:string; version:number; payload:any; actorName:string; at:string};
export function gateTasks(plan:Plan, overrides:Record<string,any>={}) : Task[] {
 return plan.milestones.map(m=>({
  ...m,id:m.id,date:m.date,originalDueDate:m.date,owner:m.owner,
  workstream:"Delivery gate",title:m.title,deliverable:m.gate,acceptance:m.gate,dueTime:m.dueTime||"22:00",
  dependencies:[...new Set([m.taskId,...(m.dependencyIds||[])].filter(Boolean))],
  target:1,targetMode:"checklist",unit:"verified gate",status:"Ready",actual:null,
  evidence:"",blocker:"",rescueOwner:"",recoveryDate:"",acceptedBy:"",closedAt:null,...overrides[m.id],
 }));
}

export const METRICS = [
  {key:"qualifiedInquiries",label:"New qualified inquiries",short:"Qualified inquiries",help:"Unique verified practice expressing a relevant need or requesting a conversation; not merely a verified contact.",unit:"inquiries",target:40},
  {key:"verifiedContacts", label:"New verified contacts",short:"Verified contacts", help:"New unique dentists passing Scout QA today.",unit:"contacts",target:750},
  {key:"contactsReached",label:"New unique dentists contacted",short:"Dentists reached",help:"First contact only; repeat email/DM/calls do not add a new person.",unit:"people"},
  {key:"emailContactsReached",label:"New unique dentists emailed",short:"Email contacts reached",help:"First successful email contact per dentist; denominator for cumulative email reply rates. Exclude bounces and duplicate touches.",unit:"people"},
  {key:"humanReplies",label:"Unique human email replies",short:"Human replies",help:"Count each contact’s first eligible human reply once; exclude OOO, autoresponders, bounces and unsubscribe-only replies.",unit:"replies"},
  {key:"positiveReplies",label:"Positive replies",short:"Positive replies",help:"Unique interested dentists, counted once.",unit:"replies"},
  {key:"booked",label:"Qualified calls booked",short:"Calls booked",help:"Unique qualified appointment recorded in CQL. Rescheduling is not a new booking.",unit:"calls",target:20},
  {key:"held",label:"Qualified calls held",short:"Calls held",help:"Completed conversations with the qualified decision maker.",unit:"calls",target:15},
  {key:"appointmentsDue",label:"Qualified appointments due today",short:"Appointments due",help:"Appointments scheduled to occur today; denominator for operational attendance. Canceled or rescheduled appointments should follow the agreed CQL reporting definition.",unit:"calls"},
  {key:"trials",label:"First trial cases received",short:"Trial cases received",help:"Distinct practices whose first qualifying trial case was actually received by DSI; promised or shipped cases do not count.",unit:"trials",target:6},
  {key:"recurring",label:"Recurring practices confirmed",short:"Recurring practices",help:"Confirmed after the required review. Later cohorts may mature in January.",unit:"practices",target:1},
  {key:"referralIntros",label:"Qualified referral introductions",short:"Referral intros",help:"Qualified intros received; not asks sent.",unit:"intros",target:15},
  {key:"referralBookings",label:"Referral-sourced bookings",short:"Referral bookings",help:"Subset of all bookings; never add again to total bookings.",unit:"calls",target:8},
  {key:"linkedinBookings",label:"LinkedIn DM-sourced bookings",short:"LinkedIn bookings",help:"Subset of all bookings; never add again to total bookings.",unit:"calls",target:8},
  {key:"adBookings",label:"LinkedIn Ads-sourced bookings",short:"Ad bookings",help:"Primary-source bookings attributed to paid LinkedIn. Separate from assisted touchpoints; used for the ad stop rule.",unit:"calls"},
  {key:"referralAsks",label:"Existing-account referral asks",short:"Referral asks",help:"Unique existing accounts personally asked for an introduction; separate from introductions received.",unit:"asks"},
  {key:"repliesDue",label:"Replies requiring a response",short:"Replies due",help:"Replies arriving during staffed 8 am–5 pm Pacific coverage.",unit:"replies"},
  {key:"repliesWithin15",label:"Replies answered within 15 minutes",short:"15-minute replies",help:"Numerator of the response SLA; cannot exceed replies requiring response.",unit:"replies"},
  {key:"positiveDue",label:"Interested replies requiring a call",short:"Positive calls due",help:"Interested replies that require a human call.",unit:"replies"},
  {key:"positivesCalledWithin60",label:"Interested replies called within 60 minutes",short:"60-minute calls",help:"Cannot exceed interested replies requiring a call.",unit:"calls"},
  {key:"spend",label:"Approved LinkedIn ad spend today",short:"Ad spend",help:"Actual spend only. Written approval required; $450 sprint cap and $300/zero-bookings stop rule.",unit:"USD",target:450},
  {key:"costs",label:"Total delivery cost today",short:"Delivery cost",help:"Capped human hours × agreed rates + tools + ad spend. Do not enter only ads.",unit:"USD"},
] as const;

export function validateTaskUpdate(task: Task, input: any, tasks: Task[], people: string[]): { value?: TaskUpdate; error?: string } {
  if (!STATUSES.includes(input.status)) return {error:"Choose a valid stage."};
  if (!Number.isInteger(input.version) || input.version < 0) return {error:"The record version is missing. Refresh and try again."};
  const value: TaskUpdate = {
    status:input.status, actual:input.actual === "" || input.actual == null ? null : Number(input.actual),
    evidence:String(input.evidence || "").trim().slice(0,4000), blocker:String(input.blocker || "").trim().slice(0,2000),
    rescueOwner:String(input.rescueOwner || "").trim().slice(0,100), recoveryDate:String(input.recoveryDate || "").trim(),
    acceptedBy:String(input.acceptedBy || "").trim().slice(0,100), reviewNote:String(input.reviewNote || "").trim().slice(0,2000),
    notes:String(input.notes || "").trim().slice(0,4000), closedAt:null,version:input.version,
  };
  if(value.actual !== null && (!Number.isFinite(value.actual) || value.actual < 0)) return {error:"Actual must be a nonnegative number, or blank if unknown."};
  if(value.recoveryDate && (!/^\d{4}-\d{2}-\d{2}$/.test(value.recoveryDate) || !Number.isFinite(Date.parse(value.recoveryDate)) || new Date(value.recoveryDate).toISOString().slice(0,10)!==value.recoveryDate)) return {error:"Enter a valid recovery date."};
  if(["Blocked","Deferred"].includes(value.status)) {
    if(!value.blocker || !value.rescueOwner || !value.recoveryDate) return {error:"Blocked or deferred work needs the reason, a recovery owner, and a recovery date."};
    if(!people.includes(value.rescueOwner)) return {error:"Choose a recovery owner from the team."};
  }
  if(value.status === "Accepted") {
    if(!value.evidence) return {error:"Attach an evidence link or a specific delivery reference before accepting."};
    if(!value.acceptedBy) return {error:"Record who reviewed and accepted this deliverable."};
    if(!people.includes(value.acceptedBy)) return {error:"Choose a reviewer from the team."};
    if(value.acceptedBy !== "Wyline" && !value.reviewNote) return {error:"A delegated review needs Wyline’s delegation or approval reference."};
    const numericTarget = typeof task.target === "number" ? task.target : null;
    if(numericTarget !== null && numericTarget>0) {
      if(value.actual === null) return {error:"Enter the actual quantity delivered before acceptance."};
      if(value.actual < numericTarget && !["capacity","demand"].includes(String(task.targetMode||task.targetKind))) return {error:"The actual is below the daily target. Keep it in progress or record a recovery plan; do not mark the target complete."};
      if(value.actual < numericTarget && ["capacity","demand"].includes(String(task.targetMode||task.targetKind)) && !value.notes) return {error:"Record why eligible demand or safe capacity was below the planning ceiling."};
    }
    const unresolved=(task.dependencies||[]).filter(id => !tasks.find(t=>t.id===id && t.status==="Accepted"));
    if(unresolved.length) return {error:`Accept the prerequisite deliverables first: ${unresolved.slice(0,5).join(", ")}.`};
  }
  return {value};
}

export function validateMetrics(input:any) {
  const value:Record<string,any>={};
  for(const metric of METRICS) {
    const v=input[metric.key];
    value[metric.key]=v===null||v===""||v===undefined ? null:Number(v);
    if(value[metric.key]!==null && (!Number.isFinite(value[metric.key])||value[metric.key]<0)) return {error:`${metric.label} must be a nonnegative number or blank.`};
    if(value[metric.key]!==null && metric.unit!=="USD" && !Number.isInteger(value[metric.key])) return {error:`${metric.label} must be a whole number.`};
  }
  if(value.repliesWithin15!==null && (value.repliesDue===null || value.repliesWithin15>value.repliesDue)) return {error:"15-minute replies cannot exceed replies requiring a response."};
  if(value.positivesCalledWithin60!==null && (value.positiveDue===null || value.positivesCalledWithin60>value.positiveDue)) return {error:"60-minute calls cannot exceed interested replies requiring a call."};
  if(value.referralBookings!==null && (value.booked===null || value.referralBookings>value.booked)) return {error:"Referral bookings must be a subset of total bookings entered for the day."};
  if(value.linkedinBookings!==null && (value.booked===null || value.linkedinBookings>value.booked)) return {error:"LinkedIn bookings must be a subset of total bookings entered for the day."};
  const attributed=(value.referralBookings||0)+(value.linkedinBookings||0)+(value.adBookings||0);
  if(attributed>0 && (value.booked===null || attributed>value.booked)) return {error:"Referral, LinkedIn DM and ad bookings must use mutually exclusive primary sources. Their sum cannot exceed total bookings."};
  if(value.positiveReplies!==null && (value.humanReplies===null || value.positiveReplies>value.humanReplies)) return {error:"Positive email replies cannot exceed eligible human email replies."};
  if(value.held!==null && value.appointmentsDue!==null && value.held>value.appointmentsDue) return {error:"Held calls cannot exceed the appointments due on this date. Include any same-day appointments in appointments due."};
  value.evidence=String(input.evidence||"").trim().slice(0,4000);
  if(!value.evidence) return {error:"Add the CQL report link or evidence reference for these actuals."};
  value.notes=String(input.notes||"").trim().slice(0,2000);
  return {value};
}
