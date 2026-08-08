/* ===========================================================================
   JURISDICTION HIERARCHY + SUB-NATIONAL COMPLIANCE LIBRARY
   ---------------------------------------------------------------------------
   Country -> state/province. State-level compliances become applicable to an
   entity only when that entity is registered in that state, which is recorded
   in entity_jurisdictions. Adding a new state later needs no code change:
   create the jurisdiction row in Administration, then import its compliances
   from the Excel template.
   =========================================================================== */

export type JurisdictionSeed = {
  id: string;
  country: string;
  parent?: string;
  level: 'federal' | 'state' | 'province' | 'municipal';
  code: string;
  name: string;
};

export type LibraryItem = {
  code: string;
  country: string;
  jurisdiction: string;
  category: string;
  title: string;
  law: string;
  form: string;
  authority: string;
  frequency: 'Monthly' | 'Quarterly' | 'Half-yearly' | 'Annual' | 'Event Based' | 'Continuous' | 'Periodic';
  dueRule: string;
  /** Structured due-date rule, used to compute real (non-random) due dates.
      Annual/Periodic/Event Based/Continuous: dueMonth + dueDay is the fixed
      calendar date. Monthly/Quarterly/Half-yearly: dueDay is the day of the
      month that falls dueOffsetMonths (default 1) after the period ends.
      Left unset where the real due date is expiry- or event-triggered rather
      than calendar-fixed (e.g. licence renewals). */
  dueMonth?: number;
  dueDay?: number;
  dueOffsetMonths?: number;
  evidence: string[];
  penalty: string;
  risk: 'Critical' | 'High' | 'Medium' | 'Low';
  listed?: boolean;
  factory?: boolean;
  importer?: boolean;
  site?: string;
};

/* ------------------------------------------------------------ hierarchy */
export const JURISDICTIONS: JurisdictionSeed[] = [
  { id: 'IN-FED', country: 'IN', level: 'federal', code: 'FED', name: 'India — Union / Central' },
  { id: 'IN-TN',  country: 'IN', parent: 'IN-FED', level: 'state', code: 'TN', name: 'Tamil Nadu' },
  { id: 'AE-FED', country: 'AE', level: 'federal', code: 'FED', name: 'United Arab Emirates — Federal' },
  { id: 'AE-FZ',  country: 'AE', parent: 'AE-FED', level: 'state', code: 'FZ',
    name: 'Free zone establishment (Dubai)' },
];

/* ------------------------------------------- sub-national compliance items
   Tamil Nadu items apply to LMW Limited (registered/operating in Coimbatore).
   Free-zone items apply to LMW Global FZE. All unverified — a local adviser
   must confirm before go-live (see README "The compliance library"). */
export const SUBNATIONAL_LIBRARY: LibraryItem[] = [
  {
    code: 'IN-TN-001', country: 'IN', jurisdiction: 'IN-TN', category: 'labour_law',
    title: 'Professional Tax — half-yearly return and payment',
    law: 'Coimbatore City Municipal Corporation Act, 1981, and the Tamil Nadu District Municipalities Act, 1920, Section 124-D',
    form: 'Half-yearly PT return', authority: 'Coimbatore City Municipal Corporation',
    frequency: 'Half-yearly', dueRule: 'By the end of the half-year itself — 30 September (Apr-Sep half) and 31 March (Oct-Mar half). Corrected from an earlier "one month after half-year end" assumption, which was a full month late; the Oct-Mar half technically ends 31 March, one day after the 30th coded here — confirm with the local body.',
    dueOffsetMonths: 0, dueDay: 30,
    evidence: ['Filed PT return', 'Payment receipt'], penalty: 'Interest and penalty on delayed payment as prescribed by the local body', risk: 'Medium',
  },
  {
    code: 'IN-TN-002', country: 'IN', jurisdiction: 'IN-TN', category: 'labour_law',
    title: 'Tamil Nadu Labour Welfare Fund — annual contribution',
    law: 'Tamil Nadu Labour Welfare Fund Act, 1972',
    form: 'Form A contribution statement', authority: 'Tamil Nadu Labour Welfare Board',
    frequency: 'Annual', dueRule: '31 December each year. The client\'s validated compliance register describes Labour Welfare Fund contribution generically as "half-yearly, commonly June and December" across the states that levy it — that is a pan-India generalisation, not confirmed as the specific Tamil Nadu cycle, and a second independent source could not be reached to cross-check it. Kept at the previously confirmed annual/31 December position rather than changing it on a single unverified source; a local adviser should confirm which cycle actually applies before relying on either.',
    dueMonth: 12, dueDay: 31,
    evidence: ['Contribution statement', 'Payment receipt'], penalty: 'Penalty for delayed contribution as prescribed', risk: 'Low',
  },
  {
    code: 'IN-TN-003', country: 'IN', jurisdiction: 'IN-TN', category: 'corporate_law',
    title: 'Shops and Establishments registration — renewal',
    law: 'Tamil Nadu Shops and Establishments Act, 1947',
    form: 'Renewal application', authority: 'Chief Inspector of Shops and Establishments, Tamil Nadu',
    frequency: 'Annual', dueRule: 'Before expiry of the existing registration certificate',
    evidence: ['Renewed registration certificate'], penalty: 'Fine and/or prosecution for operating without a valid registration', risk: 'Medium',
  },
  {
    code: 'IN-TN-004', country: 'IN', jurisdiction: 'IN-TN', category: 'environmental_ehs',
    title: 'Consent to Operate — Water (Prevention & Control of Pollution) Act, 1974',
    law: 'Water (Prevention and Control of Pollution) Act, 1974',
    form: 'CTO renewal application', authority: 'Tamil Nadu Pollution Control Board (TNPCB)',
    frequency: 'Periodic', dueRule: 'Before expiry of the existing consent (validity as fixed by TNPCB)',
    evidence: ['Renewed Consent to Operate', 'Effluent analysis reports'], penalty: 'Closure direction / prosecution for operating without a valid consent', risk: 'High', factory: true,
  },
  {
    code: 'IN-TN-005', country: 'IN', jurisdiction: 'IN-TN', category: 'environmental_ehs',
    title: 'Consent to Operate — Air (Prevention & Control of Pollution) Act, 1981',
    law: 'Air (Prevention and Control of Pollution) Act, 1981',
    form: 'CTO renewal application', authority: 'Tamil Nadu Pollution Control Board (TNPCB)',
    frequency: 'Periodic', dueRule: 'Before expiry of the existing consent (validity as fixed by TNPCB)',
    evidence: ['Renewed Consent to Operate', 'Stack emission test reports'], penalty: 'Closure direction / prosecution for operating without a valid consent', risk: 'High', factory: true,
  },
  {
    code: 'IN-TN-006', country: 'IN', jurisdiction: 'IN-TN', category: 'industry_regulation',
    title: 'Factory licence — renewal',
    law: 'Factories Act, 1948 and the Tamil Nadu Factories Rules, 1950',
    form: 'Factory licence renewal (Form 4)', authority: 'Directorate of Industrial Safety and Health, Tamil Nadu',
    frequency: 'Annual', dueRule: 'Before expiry of the existing factory licence',
    evidence: ['Renewed factory licence'], penalty: 'Prosecution and/or closure for operating without a valid licence', risk: 'Critical', factory: true,
  },
  {
    code: 'IN-TN-007', country: 'IN', jurisdiction: 'IN-TN', category: 'industry_regulation',
    title: 'Boiler certificate — renewal (foundry / heat-treatment operations)',
    law: 'Boilers Act, 1923',
    form: 'Boiler certificate renewal', authority: 'Tamil Nadu Directorate of Boilers',
    frequency: 'Annual', dueRule: 'Before expiry of the existing boiler certificate',
    evidence: ['Renewed boiler certificate', 'Inspection report'], penalty: 'Prohibition on use of the boiler until re-certified', risk: 'High', factory: true,
  },
  {
    code: 'IN-TN-009', country: 'IN', jurisdiction: 'IN-TN', category: 'labour_law',
    title: 'Industrial Disputes Act — Annual Return',
    law: 'Industrial Disputes Act, 1947 (Tamil Nadu Industrial Disputes Rules)',
    form: 'Annual return (as prescribed by the state) — plus Works Committee / Grievance Redressal Committee records',
    authority: 'Office of the Labour Commissioner, Tamil Nadu',
    frequency: 'Annual', dueRule: 'On or before 31 January for the preceding calendar year (aligned with the Factories Act annual return cycle)',
    dueMonth: 1, dueDay: 31,
    evidence: ['Filed annual return', 'Works Committee / Grievance Redressal Committee constitution records'],
    penalty: 'Prosecution and penalty under the Industrial Disputes Act for non-filing', risk: 'Medium', factory: true,
  },

  /* -------------------------------------------------- AE — Dubai free zone */
  {
    code: 'AE-FZ-001', country: 'AE', jurisdiction: 'AE-FZ', category: 'corporate_law',
    title: 'Free zone trade licence — annual renewal',
    law: 'Free zone establishment rules of the licensing authority (confirm which one — e.g. JAFZA/DAFZA/RAKEZ)',
    form: 'Licence renewal application', authority: 'Free zone licensing authority — to be confirmed',
    frequency: 'Annual', dueRule: 'Before expiry of the existing trade licence',
    evidence: ['Renewed trade licence'], penalty: 'Fines and eventual licence suspension for late renewal', risk: 'Critical',
  },
  {
    code: 'AE-FZ-002', country: 'AE', jurisdiction: 'AE-FZ', category: 'labour_law',
    title: 'Establishment / immigration card — renewal (if staff are on UAE visas)',
    law: 'UAE Federal Decree-Law on Entry and Residence of Foreigners; free zone immigration rules',
    form: 'Establishment card renewal', authority: 'Free zone immigration department / GDRFA',
    frequency: 'Annual', dueRule: 'Before expiry of the existing establishment card',
    evidence: ['Renewed establishment card'], penalty: 'Inability to process employee visas until renewed', risk: 'Medium',
  },
  {
    code: 'AE-FZ-003', country: 'AE', jurisdiction: 'AE-FZ', category: 'corporate_law',
    title: 'Audited financial statements — submission to the free zone authority',
    law: 'Free zone establishment rules of the licensing authority',
    form: 'Audited financial statements', authority: 'Free zone licensing authority — to be confirmed',
    frequency: 'Annual', dueRule: 'Within the period fixed by the free zone authority after financial year end (typically within 6 months)',
    dueMonth: 9, dueDay: 30,
    evidence: ['Signed audited financial statements'], penalty: 'Administrative fine / hold on licence renewal', risk: 'Medium',
  },
];
