import {getSessionUser} from '../../lib/auth';
import {canReview} from '../../lib/permissions';
import {redirect} from 'next/navigation';
import {UsersManager} from './users-manager';
export default async function Users(){const user=await getSessionUser();if(!user)redirect('/login');if(!canReview(user.role))redirect('/');return <UsersManager/>;}
