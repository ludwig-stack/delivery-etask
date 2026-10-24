import {getSessionUser} from '../../lib/auth';
import {redirect} from 'next/navigation';
import {ChangePasswordForm} from './password-form';
export default async function ChangePassword(){if(!await getSessionUser())redirect('/login');return <ChangePasswordForm/>;}
