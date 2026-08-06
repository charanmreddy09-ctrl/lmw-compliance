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

const NEAR_KEYWORD =
  /(filed on|filing date|date of filing|acknowledg\w*\s*date|ack\.?\s*date|submission date)[^0-9]{0,24}(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/gi;
const ANY_DATE = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/g;

function normYear(y: number): number { return y < 100 ? 2000 + y : y; }

function findCandidates(text: string): Candidate[] {
  const out: Candidate[] = [];
  for (const m of text.matchAll(NEAR_KEYWORD)) {
    out.push({ day: +m[2], month: +m[3], year: normYear(+m[4]), nearKeyword: true });
  }
  for (const m of text.matchAll(ANY_DATE)) {
    out.push({ day: +m[1], month: +m[2], year: +m[3], nearKeyword: false });
  }
  return out.filter(c => c.day >= 1 && c.day <= 31 && c.month >= 1 && c.month <= 12 && c.year >= 2000);
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
