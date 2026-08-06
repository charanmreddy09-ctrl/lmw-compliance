import { cookies } from 'next/headers';
import { authenticate, createSessionCookie, SESSION_COOKIE, SESSION_MAX_AGE, getSession, writeAudit } from '@/lib/auth';
import { handler, ok, fail, body } from '@/lib/api';
import { ROLE_LANDING } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req: Request) => {
  const { email, password } = await body<{ email?: string; password?: string }>(req);
  if (!email || !password) return fail(400, 'Enter both your email address and password.');

  const res = await authenticate(email, password);
  if (!res.ok) {
    await writeAudit({ action: 'login.failed', objectType: 'user', objectId: email, detail: res.reason });
    return fail(401, res.reason);
  }

  cookies().set(SESSION_COOKIE, await createSessionCookie(res.userId), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    path: '/', maxAge: SESSION_MAX_AGE,
  });

  const s = await getSession();
  await writeAudit({ actor: s, action: 'login', objectType: 'user', objectId: res.userId, detail: 'Signed in' });
  return ok({ user: s, redirect: s ? (ROLE_LANDING[s.role] ?? '/dashboard') : '/dashboard' });
});
