'use client';
import {passwordStrength} from '../lib/stage-one';
export function PasswordFields({password,confirm,onPassword,onConfirm,disabled=false}:{password:string;confirm:string;onPassword:(value:string)=>void;onConfirm:(value:string)=>void;disabled?:boolean}){
 const strength=passwordStrength(password);
 return <><label>Password<input required disabled={disabled} type="password" minLength={12} maxLength={200} autoComplete="new-password" value={password} onChange={e=>onPassword(e.target.value)}/></label>
 {password&&<p className={`password-strength ${strength}`} role="status">Password strength: {strength}. {strength==='weak'?'Weak passwords are not accepted. Use at least 12 characters and three character types.':''}</p>}
 <button className="text-button" type="button" disabled={disabled} onClick={()=>{const values=crypto.getRandomValues(new Uint32Array(5)),value=`aA!7${Array.from(values,n=>n.toString(36)).join('')}`;onPassword(value);onConfirm(value);}}>Generate / suggest strong password</button>
 {password&&<details><summary>Show new password</summary><code className="generated-password">{password}</code></details>}
 <label>Confirm password<input required disabled={disabled} type="password" maxLength={200} autoComplete="new-password" value={confirm} onChange={e=>onConfirm(e.target.value)}/></label>
 {confirm&&password!==confirm&&<p role="status" className="password-strength weak">Passwords do not match.</p>}</>;
}
