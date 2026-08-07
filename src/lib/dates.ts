/* Date helpers shared by the due-date engine, calendar and validation. */

export function today(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const s = String(v).trim();
  if (!s) return null;
  // dd/mm/yyyy and dd-mm-yyyy, common in Indian and European templates
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) {
    const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  // Excel serial date
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = parseFloat(s);
    const d = new Date(Date.UTC(1899, 11, 30) as unknown as number);
    d.setUTCDate(d.getUTCDate() + Math.floor(serial));
    return d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Postgres DATE columns arrive as JS Date objects. String(date) gives
    "Wed Apr 08 2026 ..." which silently corrupts any .slice(0,10). Always
    normalise a database date through here. */
export function toIsoDate(v: unknown): string | null {
  const d = parseDate(v);
  return d ? iso(d) : null;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function addMonths(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCMonth(out.getUTCMonth() + n);
  return out;
}

/** Push a date off Saturday/Sunday to the next working day. */
export function nudgeWeekend(d: Date): Date {
  const out = new Date(d);
  const day = out.getUTCDay();
  if (day === 6) out.setUTCDate(out.getUTCDate() + 2);
  if (day === 0) out.setUTCDate(out.getUTCDate() + 1);
  return out;
}

/** "FY 2026-27" for startYear 2026 — the one place this label is built, so
    the compliance library, register, dashboard and reports all agree. */
export function fyLabel(startYear: number): string {
  return `FY ${startYear}-${String(startYear + 1).slice(-2)}`;
}

/** The FY (Apr-Mar) a given date falls into, as its starting calendar year. */
export function fyStartYearOf(d: Date): number {
  return d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

export const FREQ_MONTHS: Record<string, number> = {
  Monthly: 1, Quarterly: 3, 'Half-yearly': 6, Annual: 12,
  Periodic: 12, 'Event Based': 12, Continuous: 1,
};

export function periodLabel(freq: string, d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  switch (freq) {
    case 'Monthly':
    case 'Continuous':
      return `${mon[m]} ${y}`;
    case 'Quarterly':
      return `Q${Math.floor(m / 3) + 1} ${y}`;
    case 'Half-yearly':
      return `H${m < 6 ? 1 : 2} ${y}`;
    default:
      return `FY ${y}`;
  }
}

const MON_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** DD-MMM-YYYY, e.g. 04-Aug-2026 — the house date format for this deployment. */
export function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return '—';
  const d = typeof v === 'string' ? new Date(v.length === 10 ? v + 'T00:00:00Z' : v) : v;
  if (isNaN(d.getTime())) return '—';
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${day}-${MON_SHORT[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}

export function fmtDateTime(v: string | Date | null | undefined): string {
  if (!v) return '—';
  const d = typeof v === 'string' ? new Date(v) : v;
  if (isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${day}-${MON_SHORT[d.getMonth()]}-${d.getFullYear()}, ${time}`;
}
