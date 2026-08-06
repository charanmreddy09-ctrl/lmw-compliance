import { cookies } from 'next/headers';
import { SESSION_COOKIE, getSession, writeAudit } from '@/lib/auth';
import { handler, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const POST = handler(async () => {
  const s = await getSession();
  if (s) await writeAudit({ actor: s, action: 'logout', objectType: 'user', objectId: s.id, detail: 'Signed out' });
  cookies().delete(SESSION_COOKIE);
  return ok({ ok: true });
});
