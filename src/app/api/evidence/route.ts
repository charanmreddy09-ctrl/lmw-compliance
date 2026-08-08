/* ===========================================================================
   EVIDENCE UPLOAD
   The preparer uploads the compliance together with its documentary evidence.
   The file is stored, validated automatically against that entity's compliance
   calendar, and the obligation moves into the reviewer's queue in one atomic
   step — so an upload can never leave the record half-committed.
   =========================================================================== */
import { handler, ok, fail, auth, writeAudit } from '@/lib/api';
import { q, one, tx } from '@/lib/db';
import { canFileEntity, canReviewEntity, canSeeEntity } from '@/lib/rbac';
import { validateUpload, MAX_UPLOAD_BYTES, isAllowedEvidence } from '@/lib/validate';
import { extractFiledDate, extractDueDate } from '@/lib/extract-date';
import { createHash } from 'node:crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = handler(async (req: Request) => {
  const u = await auth();
  const form = await req.formData();

  const obligationId = String(form.get('obligationId') ?? '');
  const isNil = form.get('nil') === '1';
  const file = form.get('file');
  const docType = form.get('docType') ? String(form.get('docType')) : null;
  const period = form.get('period') ? String(form.get('period')) : null;
  const comment = form.get('comment') ? String(form.get('comment')) : null;
  const lateReason = form.get('lateReason') ? String(form.get('lateReason')).trim() : null;

  if (!obligationId) return fail(400, 'Obligation reference is missing.');
  if (!isNil) {
    if (!(file instanceof File)) return fail(400, 'Choose a file to upload.');
    if (file.size === 0) return fail(400, 'The selected file is empty.');
    if (file.size > MAX_UPLOAD_BYTES)
      return fail(413, `The file is ${(file.size / 1048576).toFixed(2)} MB. The limit is ${MAX_UPLOAD_BYTES / 1048576} MB per document — split it or upload a ZIP.`);
    if (!isAllowedEvidence(file.type || '', file.name))
      return fail(415, `"${file.name}" is not an accepted evidence format. Upload a PDF, Excel, Word, ZIP, CSV or image file.`);
  }

  const obl = await one<{ entity_id: string; status: string; period_label: string; filed_date: string | null; is_late: boolean }>(
    `SELECT entity_id, status, period_label, filed_date, (filed_date IS NULL AND due_date < CURRENT_DATE) AS is_late
       FROM obligations WHERE id = $1 AND deleted_at IS NULL`,
    [obligationId]);
  if (!obl) return fail(404, 'That obligation no longer exists.');
  if (obl.status === 'Not Applicable')
    return fail(409, 'A reviewer has marked this compliance not applicable — no filing is needed.');
  if (!canSeeEntity(u, obl.entity_id)) return fail(403, 'You are not assigned to this entity.');
  if (!canFileEntity(u, obl.entity_id))
    return fail(403, 'Your role does not permit filing for this entity.');
  if (obl.is_late && !lateReason)
    return fail(400, 'A reason for the late filing is required before this can be submitted.');

  /* Nil / Not Applicable filing: no document, but still goes through the
     same reviewer approval queue as a real filing — it just carries a
     placeholder "record" instead of a document, marked is_nil so the UI can
     tell the two apart. Skips file-shaped checks (type/size/duplicate/date
     extraction) that don't mean anything for a nil filing. */
  const comment2 = lateReason ? `Reason for late filing: ${lateReason}${comment ? ` — ${comment}` : ''}` : comment;

  if (isNil) {
    const result = await tx(async c => {
      const prev = await c.query<{ v: number }>(
        `SELECT COALESCE(max(version),0) AS v FROM evidence WHERE obligation_id = $1`, [obligationId]);
      const version = Number(prev.rows[0].v) + 1;
      if (version > 1) {
        await c.query(
          `UPDATE evidence SET status = 'Superseded'
            WHERE obligation_id = $1 AND status NOT IN ('Approved','Superseded')`, [obligationId]);
      }
      const ev = await c.query<{ id: string }>(
        `INSERT INTO evidence (obligation_id, file_name, mime_type, size_bytes, checksum,
            version, doc_type, period_label, filed_date, content, status, validation, is_nil, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_DATE,$9,'Submitted','{}'::jsonb,TRUE,$10)
         RETURNING id`,
        [obligationId, 'Nil filing', 'text/plain', 0, null,
         version, 'Nil / Not Applicable', period ?? obl.period_label, Buffer.from(''), u.id]);
      await c.query(
        `UPDATE obligations SET status = 'Submitted', workflow_stage = 'reviewer' WHERE id = $1`,
        [obligationId]);
      await c.query(
        `INSERT INTO review_actions (obligation_id, evidence_id, action, actor_id, actor_role,
            from_status, to_status, comment)
         VALUES ($1,$2,'submit',$3,$4,$5,'Submitted',$6)`,
        [obligationId, ev.rows[0].id, u.id, u.role, obl.status,
         comment2 || 'Filed as Nil / Not Applicable for this period.']);
      const rv = await c.query<{ reviewer_id: string | null; title: string; country_code: string }>(
        `SELECT o.reviewer_id, c.title, e.country_code
           FROM obligations o JOIN compliances c ON c.id = o.compliance_id
           JOIN entities e ON e.id = o.entity_id WHERE o.id = $1`, [obligationId]);
      const r = rv.rows[0];
      if (r?.reviewer_id) {
        await c.query(
          `INSERT INTO notifications (user_id, country_code, entity_id, kind, title, body, link, severity)
           VALUES ($1,$2,$3,'review_pending',$4,$5,$6,'info')`,
          [r.reviewer_id, r.country_code, obl.entity_id,
           'Nil filing awaiting review',
           `${r.title} — ${obl.entity_id} (${obl.period_label}) was filed as Nil by ${u.name}.`,
           `/reviews?obligation=${obligationId}`]);
      }
      return { evidenceId: ev.rows[0].id, version };
    });
    await writeAudit({ actor: u, action: 'evidence.nil', objectType: 'obligation', objectId: obligationId,
      detail: 'Filed as Nil / Not Applicable for this period.' });
    return ok({ ...result, validation: { outcome: 'clean', checks: [] }, filedDate: { date: new Date().toISOString().slice(0, 10), source: 'defaulted' } });
  }

  const f = file as File;
  const bytes = Buffer.from(await f.arrayBuffer());
  const checksum = createHash('sha256').update(bytes).digest('hex').slice(0, 32);
  const mime = f.type || 'application/octet-stream';
  const filedDate = await extractFiledDate(bytes, mime);

  /* The filing date must come from the document, not from the clock. A blank
     or unreadable PDF used to fall back silently to today's date, which let
     an empty document pass as evidence of a real filing. If the document is
     text-searchable (PDF) and no date could be read from it, refuse the
     upload outright rather than guessing — there is nothing to "capture" from
     a document that states no date. Other formats (image, Excel, Word, ZIP)
     aren't text-searchable at all, so they keep defaulting to the upload
     date, honestly disclosed via filedDate.source — that is a known format
     limitation, not a blank-document problem. */
  if (mime === 'application/pdf' && filedDate.source === 'defaulted') {
    return fail(422, 'No filing date could be read from this PDF — it may be blank, scanned as an image with no selectable text, or genuinely missing a date. Upload a document that shows the filing/acknowledgement date, or use "File as Nil" if there is nothing to file for this period.');
  }

  /* The document usually prints the deadline it was filed against. Read it and
     compare, so a platform due date that has drifted from what the authority
     actually published becomes visible instead of silently scoring filings
     against the wrong date. The reading never changes the due date — see
     below, it raises a proposal for someone to approve. */
  const docDue = await extractDueDate(bytes, mime);
  const oblDue = await one<{ due_date: string; country_code: string }>(
    `SELECT o.due_date::text AS due_date, e.country_code
       FROM obligations o JOIN entities e ON e.id = o.entity_id WHERE o.id = $1`, [obligationId]);
  const dueMismatch = !!(docDue && oblDue && docDue.date !== oblDue.due_date.slice(0, 10));

  const validation = await validateUpload({
    obligationId,
    entityId: obl.entity_id,
    fileName: f.name,
    mimeType: f.type || 'application/octet-stream',
    sizeBytes: bytes.length,
    checksum,
    declaredPeriod: period,
    declaredFiledDate: filedDate.date,
    docType,
  });

  /* Surfaced to the preparer now and to the reviewer later, alongside every
     other check. Never blocking: the document is fine, it is the register's
     due date that may be wrong, and refusing the filing would punish the
     preparer for a data problem they did not cause. */
  if (dueMismatch && docDue && oblDue) {
    validation.checks.push({
      key: 'duedate_doc', label: 'Due date matches the document', result: 'warn', blocking: false,
      detail: `${docDue.note} The register has ${oblDue.due_date}. Raised for confirmation against the authority's portal — the due date has not been changed.`,
    });
    if (validation.outcome === 'clean') validation.outcome = 'warnings';
  }

  /* Refuse uploads that fail a blocking check. A late filing is not blocking:
     the delay is recorded and flagged, but the document is still accepted. */
  if (validation.outcome === 'blocked') {
    const first = validation.checks.find(c => c.result === 'fail' && c.blocking)!;
    return fail(first.key === 'duplicate' ? 409 : 422, first.detail);
  }

  const result = await tx(async c => {
    const prev = await c.query<{ v: number }>(
      `SELECT COALESCE(max(version),0) AS v FROM evidence WHERE obligation_id = $1`, [obligationId]);
    const version = Number(prev.rows[0].v) + 1;

    if (version > 1) {
      await c.query(
        `UPDATE evidence SET status = 'Superseded'
          WHERE obligation_id = $1 AND status NOT IN ('Approved','Superseded')`, [obligationId]);
    }

    const ev = await c.query<{ id: string }>(
      `INSERT INTO evidence (obligation_id, file_name, mime_type, size_bytes, checksum,
          version, doc_type, period_label, filed_date, content, status, validation, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Submitted',$11::jsonb,$12)
       RETURNING id`,
      [obligationId, f.name, f.type || 'application/octet-stream', bytes.length, checksum,
       version, docType, period ?? obl.period_label, filedDate.date, bytes,
       JSON.stringify(validation), u.id]);

    /* the obligation moves to the reviewer automatically */
    await c.query(
      `UPDATE obligations
          SET status = 'Submitted', workflow_stage = 'reviewer',
              filed_date = COALESCE($2::date, filed_date),
              delay_days = CASE WHEN $2::date IS NOT NULL AND $2::date > due_date
                                THEN ($2::date - due_date) ELSE delay_days END,
              penalty_exposure = $3,
              delay_reason = COALESCE($4, delay_reason)
        WHERE id = $1`,
      [obligationId, filedDate.date, validation.penaltyExposure, lateReason]);

    await c.query(
      `INSERT INTO review_actions (obligation_id, evidence_id, action, actor_id, actor_role,
          from_status, to_status, comment)
       VALUES ($1,$2,'submit',$3,$4,$5,'Submitted',$6)`,
      [obligationId, ev.rows[0].id, u.id, u.role, obl.status,
       comment2 || `Evidence uploaded (${f.name}). Automatic validation: ${validation.outcome}.`]);

    /* The document disagrees with the due date on file. Recorded as a pending
       proposal — the same status and approval path the due-date sync job
       uses — so somebody holding duedate.manage decides, and the register is
       untouched until they do. One proposal per obligation per document
       date: re-uploading the same document must not queue it twice. */
    if (dueMismatch && docDue && oblDue) {
      const already = await c.query(
        `SELECT 1 FROM due_date_changes
          WHERE obligation_id = $1 AND new_due_date = $2::date AND status = 'pending'`,
        [obligationId, docDue.date]);
      if (!already.rowCount) {
        await c.query(
          `INSERT INTO due_date_changes (obligation_id, country_code, entity_id,
              old_due_date, new_due_date, reason, source, status)
           VALUES ($1,$2,$3,$4::date,$5::date,$6,'evidence-read','pending')`,
          [obligationId, oblDue.country_code, obl.entity_id, oblDue.due_date, docDue.date,
           `${docDue.note} The register has ${oblDue.due_date}. Read from "${f.name}" on upload — confirm against the authority's portal before accepting.`]);

        const deciders = await c.query<{ id: string }>(
          `SELECT u.id FROM users u JOIN roles ro ON ro.id = u.role_id
            WHERE ro.permissions @> '["duedate.manage"]'::jsonb AND u.status = 'active'`);
        for (const dec of deciders.rows) {
          await c.query(
            `INSERT INTO notifications (user_id, country_code, entity_id, kind, title, body, link, severity, is_popup)
             VALUES ($1,$2,$3,'due_date_proposal',$4,$5,$6,'warning',FALSE)`,
            [dec.id, oblDue.country_code, obl.entity_id,
             'Uploaded document disagrees with a due date',
             `${docDue.note} The register has ${oblDue.due_date} for ${obl.period_label}. Confirm against the portal before accepting.`,
             `/compliance`]);
        }
      }
    }

    /* tell the reviewer there is something waiting */
    const rv = await c.query<{ reviewer_id: string | null; title: string; country_code: string }>(
      `SELECT o.reviewer_id, c.title, e.country_code
         FROM obligations o JOIN compliances c ON c.id = o.compliance_id
         JOIN entities e ON e.id = o.entity_id WHERE o.id = $1`, [obligationId]);
    const r = rv.rows[0];
    if (r?.reviewer_id) {
      await c.query(
        `INSERT INTO notifications (user_id, country_code, entity_id, kind, title, body, link, severity)
         VALUES ($1,$2,$3,'review_pending',$4,$5,$6,$7)`,
        [r.reviewer_id, r.country_code, obl.entity_id,
         'New submission awaiting review',
         `${r.title} — ${obl.entity_id} (${obl.period_label}) was submitted by ${u.name}.`,
         `/reviews?obligation=${obligationId}`,
         validation.outcome === 'blocked' ? 'critical' : validation.outcome === 'warnings' ? 'warning' : 'info']);
    }

    return { evidenceId: ev.rows[0].id, version };
  });

  await writeAudit({ actor: u, action: 'evidence.upload', objectType: 'obligation', objectId: obligationId,
    detail: `${f.name} (${(bytes.length / 1024).toFixed(0)} KB) v${result.version}; validation ${validation.outcome}`,
    meta: { checksum, outcome: validation.outcome, delayDays: validation.delayDays } });

  return ok({ ...result, validation, filedDate });
});

export const DELETE = handler(async (req: Request) => {
  const u = await auth();
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return fail(400, 'Evidence id is required.');

  const row = await one<{ entity_id: string; file_name: string; status: string; obligation_id: string }>(
    `SELECT o.entity_id, ev.file_name, ev.status, ev.obligation_id
       FROM evidence ev JOIN obligations o ON o.id = ev.obligation_id
      WHERE ev.id = $1 AND ev.deleted_at IS NULL`, [id]);
  if (!row) return fail(404, 'Document not found.');
  if (!canSeeEntity(u, row.entity_id)) return fail(403, 'You are not assigned to this entity.');

  /* Seeing an entity is not permission to destroy its evidence. This
     previously checked visibility alone, which let every read-only role
     withdraw documents: an Auditor holds audit.view over all entities and no
     filing rights at all, yet could soft-delete any unapproved document in
     the group — in a platform whose whole claim is that each entry is backed
     by the document proving it. Withdrawal now needs filing or review rights
     on that specific entity. */
  if (!canFileEntity(u, row.entity_id) && !canReviewEntity(u, row.entity_id))
    return fail(403, 'Your role does not permit withdrawing documents for this entity.');

  /* Approved evidence is the score's proof, so only a reviewer for that
     entity may pull it. The check was on the global compliance.review
     permission, so a reviewer scoped to one country could withdraw an
     approved document belonging to another. */
  if (row.status === 'Approved' && !canReviewEntity(u, row.entity_id))
    return fail(403, 'An approved document cannot be withdrawn. Ask the reviewer to reopen the item first.');

  await q(`UPDATE evidence SET deleted_at = now() WHERE id = $1`, [id]);
  await q(`INSERT INTO review_actions (obligation_id, action, actor_id, actor_role, comment)
           VALUES ($1,'comment',$2,$3,$4)`,
    [row.obligation_id, u.id, u.role, `Withdrew document "${row.file_name}".`]);
  await writeAudit({ actor: u, action: 'evidence.delete', objectType: 'evidence', objectId: id, detail: row.file_name });
  return ok({ ok: true });
});
