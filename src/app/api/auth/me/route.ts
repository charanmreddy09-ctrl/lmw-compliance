import { getSession } from '@/lib/auth';
import { handler, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => ok({ user: await getSession() }));
