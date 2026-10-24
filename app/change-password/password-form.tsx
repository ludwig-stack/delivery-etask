'use client';
import {useState} from 'react';
import Link from 'next/link';
import {useWorkspace} from '../workspace-tools';
import {PasswordFields} from '../password-fields';
import {passwordStrength} from '../../lib/stage-one';
export function ChangePasswordForm(){
 const {profile,reload,error}=useWorkspace();
 const [current,setCurrent]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 return <main className="account-page"><Link className="text-button" href="/">← Back to delivery</Link><h1>Change Password</h1><p>Confirm your current password, then choose a new password.</p>{profile?<form className="panel account-form" onSubmit={async e=>{e.preventDefault();setBusy(true);setMessage('');try{const response=await fetch('/api/auth/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:profile.version,currentPassword:current,newPassword:password,confirmPassword:confirm})});const data=await response.json() as {message:string;error:string};if(!response.ok)throw new Error(data.error);setCurrent('');setPassword('');setConfirm('');await reload();setMessage(data.message);}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}}><label>Current password<input required type="password" autoComplete="current-password" maxLength={200} value={current} onChange={e=>setCurrent(e.target.value)}/></label><PasswordFields password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} disabled={busy}/>{message&&<p role="status">{message}</p>}<button className="button primary" disabled={busy||!current||passwordStrength(password)==='weak'||password!==confirm}>{busy?'Changing password…':'Change password'}</button></form>:<p>{error||'Loading account…'}</p>}</main>;
}
