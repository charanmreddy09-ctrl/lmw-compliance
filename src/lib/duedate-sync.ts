/* ===========================================================================
   DUE-DATE SYNC — admin-reviewed, best-effort
   ---------------------------------------------------------------------------
   Government portals (incometax.gov.in, gst.gov.in, mca.gov.in, ...) have no
   public API for "has this due date changed". This does the next best thing:
   fetch the compliance's source page, strip it to text, and look for a date
   near the compliance's own form/title keywords. Most portals are JS-rendered
   or won't parse cleanly — in that case this says so honestly instead of
   guessing. Nothing here ever changes a live due date; a hit only inserts a
   'pending' row in due_date_changes for an Admin/CFO to approve or reject.
   =========================================================================== */

type CheckInput = {
  id: string;
  title: string;
  formReference: string | null;
  dueSourceUrl: string | null;
  governmentSite: string | null;
  dueDay: number | null;
  dueMonth: number | null;
};

export type CheckResult =
  | { found: false; note: string }
  | { found: true; candidateDay: number; candidateMonth: number; note: string };

const MONTH_NAMES = ['january','february','march','april','may','june',
  'july','august','september','october','november','december'];

/* A date coincidentally near the compliance's own title/form words isn't
   enough — government homepages mention "ITR-6" and some unrelated date in
   the same 160 characters constantly. Also require an actual due-date signal
   word nearby, or this proposes noise on almost every busy portal page. */
const DUE_SIGNAL = /\b(due|last date|extended|deadline|on or before|revised|notification|circular|notified)\b/;

/* dd/dd-mmm or "30 September" style dates, captured with a small window of
   surrounding text so we can check it mentions the form/keyword we care about. */
const DATE_PATTERNS = [
  /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/g,                    // 30/09/2026 or 30-09-2026
  /\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi,
];

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function keywordsOf(input: CheckInput): string[] {
  return [input.formReference, ...input.title.split(/\s+/)]
    .filter((w): w is string => !!w && w.length > 3)
    .map(w => w.toLowerCase());
}

/** Best-effort single-compliance check. Never throws — a fetch/parse failure
    is reported as `found:false` so the caller can carry on with the batch. */
export async function checkComplianceSource(input: CheckInput): Promise<CheckResult> {
  const url = input.dueSourceUrl || input.governmentSite;
  if (!url) return { found: false, note: 'No source URL configured for this compliance.' };

  let text: string;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; SGCMP-duedate-sync/1.0)' },
    });
    if (!res.ok) return { found: false, note: `Source returned HTTP ${res.status}.` };
    text = stripHtml(await res.text());
  } catch (e) {
    return { found: false, note: `Could not reach the source (${e instanceof Error ? e.message : 'fetch failed'}).` };
  }

  const keywords = keywordsOf(input);
  const lower = text.toLowerCase();

  for (const pattern of DATE_PATTERNS) {
    for (const m of lower.matchAll(pattern)) {
      const idx = m.index ?? 0;
      const windowStart = Math.max(0, idx - 120);
      const window = lower.slice(windowStart, idx + 40);
      if (!keywords.some(k => window.includes(k))) continue;
      if (!DUE_SIGNAL.test(window)) continue;

      let day: number, month: number;
      if (m[3] !== undefined) {
        day = parseInt(m[1], 10); month = parseInt(m[2], 10);
      } else {
        day = parseInt(m[1], 10); month = MONTH_NAMES.indexOf(m[2].toLowerCase()) + 1;
      }
      if (day < 1 || day > 31 || month < 1 || month > 12) continue;

      if (day === input.dueDay && month === input.dueMonth) {
        return { found: false, note: 'Source matches the date already on file — no change detected.' };
      }
      return {
        found: true, candidateDay: day, candidateMonth: month,
        note: `Found "${day} ${MONTH_NAMES[month - 1]}" near "${input.formReference ?? input.title}" on the source page.`,
      };
    }
  }
  return { found: false, note: 'No confident date match found on the source page — likely JS-rendered or laid out unusually. Check manually.' };
}
