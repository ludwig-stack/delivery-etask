import {getSessionUser} from '../../lib/auth';
import {redirect} from 'next/navigation';
import {AccountPage} from '../workspace-tools';
export default async function Settings(){if(!await getSessionUser())redirect('/login');return <AccountPage mode="settings"/>;}
