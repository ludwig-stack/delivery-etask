import type {UserTimezone} from './timezones';
export type Theme='default'|'dark'|'light';
export type Profile={id:string;name:string;username:string;email:string;role:string;owner:string;enabled:boolean;registered?:boolean;approvedAt?:string|null;firstName:string;lastName:string;image:string;theme:Theme;timezone:UserTimezone;notifyAssignments:boolean;notifyMentions:boolean;version:number};
export type WorkspaceSettings={workspaceName:string;logo:string;defaultTheme:Theme;refreshSeconds:number;version:number};
export type Notice={id:string;taskId:string;kind:string;message:string;at:string};
export type Inbox={version:number;readAt:string};
