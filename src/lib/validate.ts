/* ===========================================================================
   AUTOMATIC VALIDATION ENGINE
   Runs server side the moment evidence is uploaded, before a reviewer ever
   sees it. It checks the upload against the compliance calendar applicable to
   that specific entity, so a preparer cannot quietly file the wrong period or
   skip a required document.

   Every check returns a structured result which is stored on the evidence row
   (evidence.validation) and surfaced to the reviewer.
   =========================================================================== */
import { q, one } from './db';
import { parseDate, daysBetween, iso, today, toIsoDate as asIso } from './dates';

export type Check = {
  key: string;
  label: string;
  result: 'pass' | 'warn' | 'fail' | 'info';
  detail: string;
  /** True when a failure must stop the upload. A late filing fails the check but
      must still be filable — you cannot fix a missed deadline by not filing. */
  blocking?: boolean;
};

export type ValidationResult = {
  ranAt: string;
  outcome: 'clean' | 'warnings' | 'blocked';
  delayDays: number;
  penaltyExposure: string | null;
  checks: Check[];
};

type Ctx = {
  obligationId: string;
  entityId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  declaredPeriod: string | null;
  declaredFiledDate: string | null;
  docType: string | null;
};

export const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/zip',
  'application/x-zip-compressed',
  'image/png',
  'image/jpeg',
  'text/csv',
  'text/plain',
]);

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // Vercel body limit headroom

/* Recognisable statutory form codes that show up in evidence filenames —
   ordered longest-pattern-first so "GSTR-3B" is tried before a plainer
   "GSTR-\d" would match part of it. Used to catch the case where someone
   uploads the right kind of document for the wrong compliance (e.g. a
   GSTR-3B return filed against the GSTR-1 obligation) — the two forms
   share a filing portal and a similar name, so this is an easy mix-up to
   make and an easy one to catch automatically before a reviewer has to. */
const FORM_CODE_PATTERNS: RegExp[] = [
  /\bGSTR[\s-]?9C\b/i, /\bGSTR[\s-]?3B\b/i, /\bGSTR[\s-]?9\b/i, /\bGSTR[\s-]?6\b/i, /\bGSTR[\s-]?1\b/i,
  /\bITC[\s-]?04\b/i, /\bITR[\s-]?6\b/i, /\b3CEB\b/i, /\b3CEAA\b/i, /\b3CA[\s-]?3CD\b/i,
  /\bMGT[\s-]?7\b/i, /\bMGT[\s-]?14\b/i, /\bAOC[\s-]?4\b/i, /\bADT[\s-]?1\b/i, /\bDPT[\s-]?3\b/i,
  /\bCSR[\s-]?2\b/i, /\bCRA[\s-]?2\b/i, /\bCRA[\s-]?4\b/i, /\bBEN[\s-]?2\b/i, /\bDIR[\s-]?3\b/i,
  /\bMR[\s-]?3\b/i, /\bMSME[\s-]?1\b/i, /\bFC[\s-]?GPR\b/i, /\bFC[\s-]?TRS\b/i, /\bECB[\s-]?2\b/i,
  /\bRFD[\s-]?11\b/i, /\bForm[\s-]?16A?\b/i, /\bForm[\s-]?24Q\b/i, /\bForm[\s-]?26Q\b/i, /\bForm[\s-]?27Q\b/i,
  /\bForm[\s-]?138\b/i, /\bForm[\s-]?140\b/i, /\bForm[\s-]?144\b/i, /\bForm[\s-]?61A\b/i,
];

/** Normalises a matched form code to a bare comparable token, e.g.
    "GSTR-3B" / "gstr 3b" / "GSTR3B" all -> "GSTR3B". */
function normaliseFormCode(s: string): string {
  return s.toUpperCase().replace(/[\s-]+/g, '');
}

/** Every recognisable form code mentioned in a filename/label — usually 0 or 1.
    Filenames commonly use underscores/dots as separators (e.g.
    "GSTR-3B_July2026.pdf") which \b does not treat as a boundary since
    `_` is a word character — normalise those to spaces first so the
    patterns' \b anchors actually land on the form code. */
function formCodesIn(text: string): string[] {
  const cleaned = text.replace(/[_.]/g, ' ');
  const found = new Set<string>();
  for (const re of FORM_CODE_PATTERNS) {
    const m = cleaned.match(re);
    if (m) found.add(normaliseFormCode(m[0]));
  }
  return [...found];
}

/* Extensions that must never be accepted as evidence, whatever MIME type the
   browser reports. Compliance evidence is a document, never an executable. */
const BLOCKED_EXT = /\.(exe|dll|bat|cmd|com|scr|msi|ps1|sh|vbs|js|jar|apk|app|deb|rpm|iso|dmg)$/i;

/** True when this file may be stored as evidence at all. */
export function isAllowedEvidence(mimeType: string, fileName: string): boolean {
  if (BLOCKED_EXT.test(fileName.trim())) return false;
  return ALLOWED_MIME.has(mimeType);
}

export async function validateUpload(ctx: Ctx): Promise<ValidationResult> {
  const checks: Check[] = [];
  const push = (c: Check) => checks.push(c);

  const obl = await one<{
    id: string; entity_id: string; period_label: string; due_date: string;
    original_due_date: string | null; status: string;
    title: string; frequency: string; evidence_required: string[];
    penalty: string | null; form_reference: string | null;
    country_code: string;
  }>(
    `SELECT o.id, o.entity_id, o.period_label, o.due_date, o.original_due_date, o.status,
            c.title, c.frequency, c.evidence_required, c.penalty, c.form_reference, c.country_code
       FROM obligations o
       JOIN compliances c ON c.id = o.compliance_id
      WHERE o.id = $1 AND o.deleted_at IS NULL`,
    [ctx.obligationId]
  );

  if (!obl) {
    return {
      ranAt: new Date().toISOString(),
      outcome: 'blocked',
      delayDays: 0,
      penaltyExposure: null,
      checks: [{ key: 'obligation', label: 'Obligation exists', result: 'fail', blocking: true,
                 detail: 'The obligation this document was uploaded against no longer exists.' }],
    };
  }

  /* -------------------------------------------------- 1. file type & size */
  if (ALLOWED_MIME.has(ctx.mimeType)) {
    push({ key: 'filetype', label: 'Accepted file type', result: 'pass',
           detail: `${ctx.mimeType} is an accepted evidence format.` });
  } else {
    push({ key: 'filetype', label: 'Accepted file type', result: 'warn',
           detail: `${ctx.mimeType || 'unknown type'} is outside the standard list (PDF, Excel, Word, ZIP, image). Reviewer should confirm it is readable.` });
  }

  if (ctx.sizeBytes === 0) {
    push({ key: 'filesize', label: 'File is not empty', result: 'fail', blocking: true,
           detail: 'The uploaded file contains no data.' });
  } else if (ctx.sizeBytes > MAX_UPLOAD_BYTES) {
    push({ key: 'filesize', label: 'File within size limit', result: 'fail', blocking: true,
           detail: `File is ${(ctx.sizeBytes / 1048576).toFixed(2)} MB. The limit is ${(MAX_UPLOAD_BYTES / 1048576).toFixed(0)} MB — split the document or upload a compressed archive.` });
  } else {
    push({ key: 'filesize', label: 'File within size limit', result: 'pass',
           detail: `${(ctx.sizeBytes / 1024).toFixed(0)} KB.` });
  }

  /* ------------------------------------------------------ 2. duplicates
     Checked by content checksum across every obligation, not just this one
     — the same PDF re-uploaded against a different (often wrong) obligation
     is exactly the kind of mistake this should catch, not let through. */
  const dup = await one<{
    id: string; file_name: string; uploaded_at: string; obligation_id: string;
    title: string; period_label: string; entity_name: string;
  }>(
    `SELECT ev.id, ev.file_name, ev.uploaded_at, ev.obligation_id,
            c.title, o.period_label, e.short_name AS entity_name
       FROM evidence ev
       JOIN obligations o ON o.id = ev.obligation_id
       JOIN compliances c ON c.id = o.compliance_id
       JOIN entities e ON e.id = o.entity_id
      WHERE ev.checksum = $1 AND ev.deleted_at IS NULL LIMIT 1`,
    [ctx.checksum]
  );
  if (dup && dup.obligation_id === ctx.obligationId) {
    push({ key: 'duplicate', label: 'Not a duplicate upload', result: 'fail', blocking: true,
           detail: `An identical file ("${dup.file_name}") was already uploaded against this obligation.` });
  } else if (dup) {
    push({ key: 'duplicate', label: 'Not a duplicate upload', result: 'fail', blocking: true,
           detail: `An identical file ("${dup.file_name}") is already on file against a different obligation — ${dup.title} for ${dup.entity_name} (${dup.period_label}). Confirm this is really meant for this obligation before uploading it again.` });
  } else {
    push({ key: 'duplicate', label: 'Not a duplicate upload', result: 'pass',
           detail: 'No identical file found anywhere in the evidence register.' });
  }

  /* ------------------------------------------------- 3. correct period */
  if (ctx.declaredPeriod) {
    if (ctx.declaredPeriod.trim().toLowerCase() === obl.period_label.trim().toLowerCase()) {
      push({ key: 'period', label: 'Correct reporting period', result: 'pass',
             detail: `Period "${obl.period_label}" matches the obligation.` });
    } else {
      push({ key: 'period', label: 'Correct reporting period', result: 'fail', blocking: true,
             detail: `Document declares period "${ctx.declaredPeriod}" but this obligation covers "${obl.period_label}".` });
    }
  } else {
    push({ key: 'period', label: 'Correct reporting period', result: 'warn',
           detail: `No period declared on upload. Obligation covers "${obl.period_label}".` });
  }

  /* --------------------------------------------- 3b. document matches form */
  const uploadedCodes = formCodesIn(`${ctx.docType ?? ''} ${ctx.fileName}`);
  const expectedCodes = formCodesIn(`${obl.form_reference ?? ''} ${obl.title}`);
  if (uploadedCodes.length && expectedCodes.length) {
    const matches = uploadedCodes.some(c => expectedCodes.includes(c));
    if (!matches) {
      push({ key: 'formmatch', label: 'Document matches this compliance', result: 'warn',
             detail: `This looks like ${uploadedCodes.join(' / ')} from the file name, but this obligation is for ${obl.form_reference ?? obl.title} (${expectedCodes.join(' / ')}). Confirm the correct document is attached before it goes to review.` });
    } else {
      push({ key: 'formmatch', label: 'Document matches this compliance', result: 'pass',
             detail: `File name matches the expected form (${expectedCodes.join(' / ')}).` });
    }
  }

  /* --------------------------- 4. filing date vs due date, delay, penalty */
  const due = parseDate(obl.due_date)!;
  const filed = parseDate(ctx.declaredFiledDate);
  let delayDays = 0;
  let penaltyExposure: string | null = null;

  if (!filed) {
    push({ key: 'fileddate', label: 'Date of filing captured', result: 'warn',
           detail: 'No actual filing date was provided, so delay cannot be computed automatically.' });
  } else {
    push({ key: 'fileddate', label: 'Date of filing captured', result: 'pass',
           detail: `Declared filing date ${iso(filed)}.` });

    if (filed.getTime() > today().getTime()) {
      push({ key: 'futuredate', label: 'Filing date is not in the future', result: 'fail', blocking: true,
             detail: `Filing date ${iso(filed)} is later than today.` });
    }

    delayDays = Math.max(0, daysBetween(due, filed));
    if (delayDays === 0) {
      push({ key: 'timeliness', label: 'Filed on or before the due date', result: 'pass',
             detail: `Due ${iso(due)}, filed ${iso(filed)}.` });
    } else {
      penaltyExposure = obl.penalty || 'Refer to the statutory penalty for this obligation.';
      push({ key: 'timeliness', label: 'Filed on or before the due date', result: 'fail',
             detail: `Filed ${delayDays} day${delayDays === 1 ? '' : 's'} late (due ${iso(due)}, filed ${iso(filed)}). Penalty exposure: ${penaltyExposure}` });
    }
  }

  /* ------------------------------ 5. due date changed since assignment */
  const origIso = asIso(obl.original_due_date);
  const dueIso = asIso(obl.due_date);
  if (origIso && dueIso && origIso !== dueIso) {
    push({ key: 'duechange', label: 'Due date stability', result: 'info',
           detail: `The due date was revised from ${origIso} to ${dueIso}. Delay is measured against the revised date.` });
  }

  /* ------------------------------------ 6. required documents checklist */
  const required: string[] = Array.isArray(obl.evidence_required) ? obl.evidence_required : [];
  if (required.length) {
    const existing = await q<{ doc_type: string | null; file_name: string }>(
      `SELECT doc_type, file_name FROM evidence
        WHERE obligation_id = $1 AND deleted_at IS NULL AND status <> 'Superseded'`,
      [ctx.obligationId]
    );
    const haystack = [
      ...existing.map(e => `${e.doc_type ?? ''} ${e.file_name}`.toLowerCase()),
      `${ctx.docType ?? ''} ${ctx.fileName}`.toLowerCase(),
    ].join(' | ');

    const missing = required.filter(r => {
      const words = r.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3);
      if (!words.length) return false;
      return !words.some(w => haystack.includes(w));
    });

    if (!missing.length) {
      push({ key: 'checklist', label: 'Required documents present', result: 'pass',
             detail: `All ${required.length} required document type${required.length === 1 ? '' : 's'} appear to be attached.` });
    } else {
      push({ key: 'checklist', label: 'Required documents present', result: 'warn',
             detail: `Still expected: ${missing.join('; ')}.` });
    }
  }

  /* -------------------------------------------- 7. expired / stale document */
  if (filed) {
    const ageDays = daysBetween(filed, today());
    if (ageDays > 400) {
      push({ key: 'stale', label: 'Document is current', result: 'warn',
             detail: `The declared filing date is ${ageDays} days old. Confirm this is the correct period's document.` });
    }
  }

  /* ----------------------------------------------- 8. reviewer assignment */
  const reviewer = await one<{ reviewer_id: string | null }>(
    `SELECT reviewer_id FROM obligations WHERE id = $1`, [ctx.obligationId]
  );
  if (reviewer?.reviewer_id) {
    push({ key: 'reviewer', label: 'Reviewer assigned', result: 'pass', detail: 'A reviewer is assigned and will be notified.' });
  } else {
    push({ key: 'reviewer', label: 'Reviewer assigned', result: 'warn',
           detail: 'No reviewer is assigned. The item will sit in the unassigned review queue until a reviewer is allocated.' });
  }

  const blocked = checks.some(c => c.result === 'fail' && c.blocking);
  const flagged = checks.some(c => c.result === 'fail' || c.result === 'warn');

  return {
    ranAt: new Date().toISOString(),
    outcome: blocked ? 'blocked' : flagged ? 'warnings' : 'clean',
    delayDays,
    penaltyExposure,
    checks,
  };
}
