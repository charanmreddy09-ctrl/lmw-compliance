/* Streams the stored document for preview or download. */
import { handler, fail, auth } from '@/lib/api';
import { one } from '@/lib/db';
import { canSeeEntity } from '@/lib/rbac';
import { writeAudit } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req: Request, ctx: { params: { id: string } }) => {
  const u = await auth();
  const disposition = new URL(req.url).searchParams.get('dl') === '1' ? 'attachment' : 'inline';

  const row = await one<{
    file_name: string; mime_type: string; content: Buffer; entity_id: string; size_bytes: string;
  }>(`SELECT ev.file_name, ev.mime_type, ev.content, ev.size_bytes, o.entity_id
        FROM evidence ev JOIN obligations o ON o.id = ev.obligation_id
       WHERE ev.id = $1 AND ev.deleted_at IS NULL`, [ctx.params.id]);

  if (!row) return fail(404, 'Document not found.');
  if (!canSeeEntity(u, row.entity_id)) return fail(403, 'You are not assigned to this entity.');

  if (disposition === 'attachment') {
    await writeAudit({ actor: u, action: 'evidence.download', objectType: 'evidence',
      objectId: ctx.params.id, detail: row.file_name });
  }

  const safe = row.file_name.replace(/[^\w.\- ]+/g, '_');
  return new Response(new Uint8Array(row.content), {
    headers: {
      'content-type': row.mime_type || 'application/octet-stream',
      'content-disposition': `${disposition}; filename="${safe}"`,
      'content-length': String(row.content.length),
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
});
