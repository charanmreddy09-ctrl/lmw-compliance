import { handler, ok, auth, body } from '@/lib/api';
import { q } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req: Request) => {
  const u = await auth();
  const onlyPopup = new URL(req.url).searchParams.get('popup') === 'true';
  const rows = await q(`
    SELECT id, country_code, entity_id, kind, title, body, link, severity, is_popup, read_at, created_at
      FROM notifications
     WHERE user_id = $1 ${onlyPopup ? 'AND is_popup AND read_at IS NULL' : ''}
     ORDER BY created_at DESC LIMIT ${onlyPopup ? 12 : 60}`, [u.id]);
  const [unread] = await q<{ n: string }>(
    `SELECT count(*) AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL`, [u.id]);
  return ok({ notifications: rows, unread: Number(unread?.n ?? 0) });
});

export const POST = handler(async (req: Request) => {
  const u = await auth();
  const { ids, all } = await body<{ ids?: number[]; all?: boolean }>(req);
  if (all) {
    await q(`UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`, [u.id]);
  } else if (ids?.length) {
    await q(`UPDATE notifications SET read_at = now() WHERE user_id = $1 AND id = ANY($2)`, [u.id, ids]);
  }
  return ok({ ok: true });
});
