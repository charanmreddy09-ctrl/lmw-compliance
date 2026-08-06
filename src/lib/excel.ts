/* ===========================================================================
   EXCEL TEMPLATES, IMPORT AND EXPORT
   The business user maintains the compliance library and the due-date calendar
   from Excel. Templates are generated per country so the jurisdiction column is
   pre-filled with the valid options for that country.
   =========================================================================== */
import * as XLSX from 'xlsx';

export const COMPLIANCE_COLUMNS = [
  'Code', 'Country', 'Jurisdiction', 'Category', 'Compliance Name',
  'Applicable Law', 'Form / Reference', 'Authority', 'Government Website',
  'Frequency', 'Due Rule', 'Due Day', 'Due Month',
  'Evidence Required (separate with |)', 'Penalty', 'Risk',
  'Applies Only If Listed', 'Applies Only If Factory', 'Applies Only If Importer',
] as const;

export const DUEDATE_COLUMNS = [
  'Compliance Code', 'Entity ID', 'Period Label', 'New Due Date (DD/MM/YYYY)', 'Reason for Change',
] as const;

export type ParsedCompliance = {
  code: string; country: string; jurisdiction: string; category: string;
  title: string; law: string; form: string; authority: string; site: string;
  frequency: string; dueRule: string; dueDay: number | null; dueMonth: number | null;
  evidence: string[]; penalty: string; risk: string;
  listed: boolean; factory: boolean; importer: boolean;
  _row: number;
};

export type ParsedDueDate = {
  code: string; entityId: string; period: string; newDue: string; reason: string; _row: number;
};

function truthy(v: unknown): boolean {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'yes' || s === 'y' || s === 'true' || s === '1';
}

function sheetToRows(buf: ArrayBuffer): Record<string, unknown>[] {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const first = wb.SheetNames.find(n => !/instruction|reference|readme/i.test(n)) ?? wb.SheetNames[0];
  const ws = wb.Sheets[first];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false });
}

export function parseComplianceWorkbook(buf: ArrayBuffer): {
  rows: ParsedCompliance[]; errors: string[];
} {
  const raw = sheetToRows(buf);
  const rows: ParsedCompliance[] = [];
  const errors: string[] = [];

  raw.forEach((r, i) => {
    const rowNo = i + 2; // header is row 1
    const get = (k: string) => String(r[k] ?? '').trim();
    const title = get('Compliance Name');
    const country = get('Country').toUpperCase();
    if (!title && !country) return; // blank line

    if (!title) { errors.push(`Row ${rowNo}: Compliance Name is required.`); return; }
    if (!country || country.length !== 2) {
      errors.push(`Row ${rowNo}: Country must be a 2-letter code such as IN or US.`); return;
    }
    const freq = get('Frequency');
    const allowed = ['Monthly','Quarterly','Half-yearly','Annual','Event Based','Continuous','Periodic'];
    if (!allowed.includes(freq)) {
      errors.push(`Row ${rowNo}: Frequency "${freq}" is not valid. Use one of: ${allowed.join(', ')}.`);
      return;
    }
    const risk = get('Risk') || 'Medium';
    if (!['Critical','High','Medium','Low'].includes(risk)) {
      errors.push(`Row ${rowNo}: Risk "${risk}" is not valid. Use Critical, High, Medium or Low.`);
      return;
    }

    const dueDay = parseInt(get('Due Day'), 10);
    const dueMonth = parseInt(get('Due Month'), 10);

    rows.push({
      code: get('Code') || `${country}-IMP-${Date.now().toString(36).toUpperCase()}-${rowNo}`,
      country,
      jurisdiction: get('Jurisdiction') || `${country}-FED`,
      category: get('Category'),
      title,
      law: get('Applicable Law'),
      form: get('Form / Reference'),
      authority: get('Authority'),
      site: get('Government Website'),
      frequency: freq,
      dueRule: get('Due Rule'),
      dueDay: Number.isFinite(dueDay) && dueDay >= 1 && dueDay <= 31 ? dueDay : null,
      dueMonth: Number.isFinite(dueMonth) && dueMonth >= 1 && dueMonth <= 12 ? dueMonth : null,
      evidence: get('Evidence Required (separate with |)')
        .split('|').map(s => s.trim()).filter(Boolean),
      penalty: get('Penalty'),
      risk,
      listed: truthy(r['Applies Only If Listed']),
      factory: truthy(r['Applies Only If Factory']),
      importer: truthy(r['Applies Only If Importer']),
      _row: rowNo,
    });
  });

  return { rows, errors };
}

export function parseDueDateWorkbook(buf: ArrayBuffer): {
  rows: ParsedDueDate[]; errors: string[];
} {
  const raw = sheetToRows(buf);
  const rows: ParsedDueDate[] = [];
  const errors: string[] = [];

  raw.forEach((r, i) => {
    const rowNo = i + 2;
    const get = (k: string) => String(r[k] ?? '').trim();
    const code = get('Compliance Code');
    const newDue = get('New Due Date (DD/MM/YYYY)') || get('New Due Date');
    if (!code && !newDue) return;
    if (!code) { errors.push(`Row ${rowNo}: Compliance Code is required.`); return; }
    if (!newDue) { errors.push(`Row ${rowNo}: New Due Date is required.`); return; }
    rows.push({
      code,
      entityId: get('Entity ID'),
      period: get('Period Label'),
      newDue,
      reason: get('Reason for Change'),
      _row: rowNo,
    });
  });

  return { rows, errors };
}

/* -------------------------------------------------------------- templates */
type TemplateOpts = {
  countryCode?: string;
  countryName?: string;
  jurisdictions?: { id: string; name: string; level: string }[];
  categories?: { id: string; name: string }[];
  entities?: { id: string; name: string }[];
  sample?: Record<string, string>[];
};

function autoWidth(rows: unknown[][], min = 10, max = 46): { wch: number }[] {
  const widths: number[] = [];
  rows.forEach(r => r.forEach((c, i) => {
    const len = String(c ?? '').length;
    widths[i] = Math.min(max, Math.max(widths[i] ?? min, len + 2));
  }));
  return widths.map(w => ({ wch: w }));
}

export function complianceTemplate(opts: TemplateOpts): Buffer {
  const header = [...COMPLIANCE_COLUMNS];
  const sample = opts.sample?.length
    ? opts.sample.map(s => header.map(h => s[h] ?? ''))
    : [[
        `${opts.countryCode ?? 'XX'}-NEW-001`,
        opts.countryCode ?? 'XX',
        opts.jurisdictions?.[0]?.id ?? `${opts.countryCode ?? 'XX'}-FED`,
        opts.categories?.[0]?.id ?? 'direct_tax',
        'Example — annual corporate tax return',
        'Name of the statute and section',
        'Form number or reference',
        'Name of the filing authority',
        'https://',
        'Annual',
        'Within 6 months of financial year end',
        '30', '9',
        'Filed return with acknowledgement|Payment challan|Computation working',
        'Describe the statutory penalty for delay',
        'High',
        'No', 'No', 'No',
      ]];

  const data = [header, ...sample];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = autoWidth(data);
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: header.length - 1 } }) };
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Compliances');

  /* reference sheet so the user never has to guess a valid value */
  const ref: unknown[][] = [
    ['SGCMP COMPLIANCE IMPORT TEMPLATE'],
    [opts.countryName ? `Prepared for: ${opts.countryName} (${opts.countryCode})` : 'Prepared for: all countries'],
    [],
    ['HOW TO USE'],
    ['1. Fill one row per compliance on the "Compliances" sheet. Do not rename the column headings.'],
    ['2. Leave Code blank to let the platform generate one, or supply your own to update an existing record.'],
    ['3. Jurisdiction controls state-level applicability. Use the federal code for a national compliance.'],
    ['4. Separate multiple evidence requirements with the pipe character |'],
    ['5. Save and upload the file in Compliance Library -> Import. Records become active immediately.'],
    [],
    ['VALID FREQUENCY VALUES'],
    ...['Monthly','Quarterly','Half-yearly','Annual','Event Based','Continuous','Periodic'].map(v => [v]),
    [],
    ['VALID RISK VALUES'],
    ...['Critical','High','Medium','Low'].map(v => [v]),
  ];
  if (opts.jurisdictions?.length) {
    ref.push([], ['VALID JURISDICTION CODES'], ['Code', 'Name', 'Level']);
    opts.jurisdictions.forEach(j => ref.push([j.id, j.name, j.level]));
  }
  if (opts.categories?.length) {
    ref.push([], ['VALID CATEGORY CODES'], ['Code', 'Name']);
    opts.categories.forEach(c => ref.push([c.id, c.name]));
  }
  const wsRef = XLSX.utils.aoa_to_sheet(ref);
  wsRef['!cols'] = autoWidth(ref, 14, 90);
  XLSX.utils.book_append_sheet(wb, wsRef, 'Instructions & Reference');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export function dueDateTemplate(opts: TemplateOpts & { obligations?: Record<string, string>[] }): Buffer {
  const header = [...DUEDATE_COLUMNS];
  const body = opts.obligations?.length
    ? opts.obligations.map(o => [o.code, o.entityId, o.period, o.due, ''])
    : [['IN-FED-001', 'E-IN-HQ', 'FY 2026', '30/10/2026', 'Extension notified by the authority']];
  const data = [header, ...body];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = autoWidth(data, 16, 40);
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Due Dates');

  const ref: unknown[][] = [
    ['SGCMP DUE DATE IMPORT TEMPLATE'],
    [opts.countryName ? `Prepared for: ${opts.countryName} (${opts.countryCode})` : 'Prepared for: all countries'],
    [],
    ['HOW TO USE'],
    ['1. The sheet is pre-filled with the current due dates for this country.'],
    ['2. Change only the "New Due Date" column, and add a reason.'],
    ['3. Leave Entity ID blank to apply the change to every entity in this country.'],
    ['4. Leave Period Label blank to apply to all open periods of that compliance.'],
    ['5. On upload the platform records the change, updates the calendar, recalculates delay,'],
    ['   notifies every affected user and raises a country-specific popup on their next screen.'],
    [],
    ['DATE FORMAT'], ['DD/MM/YYYY  (for example 30/10/2026)'],
  ];
  if (opts.entities?.length) {
    ref.push([], ['ENTITY IDS FOR THIS COUNTRY'], ['Entity ID', 'Entity Name']);
    opts.entities.forEach(e => ref.push([e.id, e.name]));
  }
  const wsRef = XLSX.utils.aoa_to_sheet(ref);
  wsRef['!cols'] = autoWidth(ref, 14, 90);
  XLSX.utils.book_append_sheet(wb, wsRef, 'Instructions & Reference');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/** Generic export used by every report and grid. */
export function toWorkbook(sheets: { name: string; rows: Record<string, unknown>[] }[]): Buffer {
  const wb = XLSX.utils.book_new();
  sheets.forEach(s => {
    const ws = s.rows.length
      ? XLSX.utils.json_to_sheet(s.rows)
      : XLSX.utils.aoa_to_sheet([['No data for the selected filters']]);
    if (s.rows.length) {
      const header = Object.keys(s.rows[0]);
      const aoa = [header, ...s.rows.map(r => header.map(h => r[h]))];
      ws['!cols'] = autoWidth(aoa);
      ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: header.length - 1 } }) };
      ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    }
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  });
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
