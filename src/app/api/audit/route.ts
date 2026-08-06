import { handler, ok, authWith } from '@/lib/api';
import { q } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req: Request) => {
  await authWith('audit.view');
  const p = new URL(req.url).searchParams;
  const vals: unknown[] = [];
  const where: string[] = ['1=1'];
  if (p.get('action')) { vals.push(`%${p.get('action')}%`); where.push(`action ILIKE $${vals.length}`); }
  if (p.get('actor')) { vals.push(`%${p.get('actor')}%`); where.push(`actor_email ILIKE $${vals.length}`); }
  if (p.get('object')) { vals.push(p.get('object')); where.push(`object_type = $${vals.length}`); }

  const rows = await q(`
    SELECT id, actor_email, actor_role, action, object_type, object_id, detail, created_at
      FROM audit_log WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC LIMIT 400`, vals);
  return ok({ entries: rows });
});
