export const canReview = (role:string) => role==='reviewer'||role==='admin';
export const canEditTask = (role:string,owner:string,taskOwner:string,status:string,isGate:boolean) =>
  canReview(role)||(role==='staff'&&owner===taskOwner&&status!=='Accepted'&&!isGate);
export const canAcceptTask = (role:string,owner:string,taskOwner:string) =>
  role==='admin'||(role==='reviewer'&&owner!==taskOwner);
export const canRecordMetrics = (role:string,owner:string) => canReview(role)||(role==='staff'&&owner==='Nova');
export const canDeleteDeliverable = canReview;
