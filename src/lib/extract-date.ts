/* ===========================================================================
   FILED-DATE EXTRACTION
   ---------------------------------------------------------------------------
   The preparer no longer types the filing date by hand — it's read from the
   document they just uploaded. For a PDF, pull the text and look for a date
   near a filing-related phrase first ("filed on", "acknowledgement date", ...),
   then fall back to any dd/mm/yyyy-shaped date in the document. Non-PDF
   evidence (images, Office docs, zips) isn't text-searchable here, so it
   defaults to the upload date — always reported honestly via `source`.
   =========================================================================== */
// Import the internal module directly, not the package's index.js — that
// entry point runs a debug self-test at import time (reading a bundled test
// PDF) whenever it can't detect a CommonJS parent module, which throws ENOENT
// under webpack/Next.js bundling. lib/pdf-parse.js is the actual implementation.
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

export type FiledDateResult = {
  date: string;                         // YYYY-MM-DD, always populated
  source: 'extracted' | 'defaulted';
  note: string;
};

type Candidate = { day: number; month: number; year: number; nearKeyword: boolean };

/* Real filing/acknowledgement receipts don't all use the same words - a GST
   ARN receipt says "ARN Date" or "Date of ARN", not "acknowledgement date".
   Keep widening this list as new portals' actual wording turns up rather
   than guessing once and leaving it - a phrase this misses falls straight
   through to ANY_DATE below, which has no idea what a date near this
   keyword list. */
const NEAR_KEYWORD =
  /(filed on|e-?filed on|filing date|date of filing|acknowledg\w*\s*date|ack\.?\s*date|arn\s*(?:generation)?\s*date|date of arn|submission date|submitted on|generated on|payment date|paid on)[^0-9]{0,24}(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/gi;
const ANY_DATE = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/g;

/* A return/tax period is a range ("Return period 01/07/2026 to 31/07/2026",
   "Tax period: 01-04-2026 to 30-06-2026") - neither end of it is the day
   anything was actually filed, but it is almost always the first date-shaped
   text in a filing receipt, right at the top describing what the filing
   covers. Left unhandled, that's exactly what ANY_DATE grabs once no
   keyword above matches the document's own wording for the real filing
   date - the return period, not the filing date, ends up on the record.
   Both keyworded ("period ... X to Y") and bare ("X to Y"/"X - Y") ranges
   are excluded from the fallback entirely, keyword match or not: a date
   that is one side of a stated range is never a stand-alone filing date. */
const PERIOD_RANGE =
  /(return period|tax period|period|for the (?:month|quarter|year) of)[^0-9]{0,20}(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\s*(?:to|through|[-–])\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/gi;
const BARE_RANGE =
  /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\s*(?:to|through|[-–])\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/gi;

function normYear(y: number): number { return y < 100 ? 2000 + y : y; }

/** Character spans covered by a stated date range. matchAll on ANY_DATE runs
    independently of PERIOD_RANGE/BARE_RANGE - it has no idea they matched
    anything, and finds each side of "X to Y" as two ordinary, unrelated
    dates on its own. Any ANY_DATE hit inside one of these spans is one side
    of a range, not a stand-alone date, and is dropped before it ever
    becomes a candidate. */
function rangeSpans(text: string): [number, number][] {
  const spans: [number, number][] = [];
  for (const re of [PERIOD_RANGE, BARE_RANGE]) {
    for (const m of text.matchAll(re)) spans.push([m.index!, m.index! + m[0].length]);
  }
  return spans;
}

function findCandidates(text: string): Candidate[] {
  const out: Candidate[] = [];
  for (const m of text.matchAll(NEAR_KEYWORD)) {
    out.push({ day: +m[2], month: +m[3], year: normYear(+m[4]), nearKeyword: true });
  }
  const spans = rangeSpans(text);
  for (const m of text.matchAll(ANY_DATE)) {
    if (spans.some(([start, end]) => m.index! >= start && m.index! < end)) continue;
    out.push({ day: +m[1], month: +m[2], year: +m[3], nearKeyword: false });
  }
  return out.filter(c => c.day >= 1 && c.day <= 31 && c.month >= 1 && c.month <= 12 && c.year >= 2000);
}

/* ---------------------------------------------------------------- due date
   The document usually states the deadline it was filed against ("due date",
   "last date for filing", "on or before"). Reading it lets the platform check
   its own due date against what the authority actually printed.

   This never sets a due date. A statutory deadline is whatever the portal
   publishes, and a date scraped out of a document is evidence about that
   deadline, not the deadline itself — so a disagreement is raised as a
   validation warning and a proposal for a human to approve, exactly the way
   the due-date sync job already works. */
export type DueDateResult = { date: string; note: string } | null;

const DUE_KEYWORD =
  /(due date|due on|last date(?:\s+for\s+\w+)?|on or before|payable by|to be filed by|filing deadline)[^0-9]{0,24}(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/gi;

export async function extractDueDate(buffer: Buffer, mimeType: string): Promise<DueDateResult> {
  if (mimeType !== 'application/pdf') return null;
  let text = '';
  try {
    text = (await pdfParse(buffer)).text || '';
  } catch {
    return null;
  }
  for (const m of text.matchAll(DUE_KEYWORD)) {
    const day = +m[2], month = +m[3], year = normYear(+m[4]);
    if (day < 1 || day > 31 || month < 1 || month > 12 || year < 2000) continue;
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (isNaN(new Date(iso + 'T00:00:00Z').getTime())) continue;
    return { date: iso, note: `The document states a due date of ${day}/${month}/${year}.` };
  }
  return null;
}

export async function extractFiledDate(buffer: Buffer, mimeType: string): Promise<FiledDateResult> {
  const todayIso = new Date().toISOString().slice(0, 10);

  if (mimeType !== 'application/pdf') {
    return { date: todayIso, source: 'defaulted',
      note: 'Automatic date detection only reads PDF text today — using the upload date for this file type.' };
  }

  let text = '';
  try {
    text = (await pdfParse(buffer)).text || '';
  } catch {
    return { date: todayIso, source: 'defaulted', note: 'Could not read text from this PDF — using the upload date.' };
  }

  const candidates = findCandidates(text).sort((a, b) => Number(b.nearKeyword) - Number(a.nearKeyword));
  for (const c of candidates) {
    const iso = `${c.year}-${String(c.month).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`;
    const d = new Date(iso + 'T00:00:00Z');
    if (isNaN(d.getTime()) || d.getTime() > Date.now()) continue;
    return {
      date: iso, source: 'extracted',
      note: c.nearKeyword
        ? `Detected ${c.day}/${c.month}/${c.year} next to a filing-date label in the document.`
        : `Detected ${c.day}/${c.month}/${c.year} in the document text.`,
    };
  }
  return { date: todayIso, source: 'defaulted', note: 'No usable date found in the document text — using the upload date.' };
}
