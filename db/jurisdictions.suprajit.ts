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
  /** Structured due-date rule, used to compute real (non-placeholder) due
      dates. Annual/Periodic/Event Based/Continuous: dueMonth + dueDay is the
      fixed calendar date, expressed in the country's own financial year.
      Monthly/Quarterly/Half-yearly: dueDay is the day of the month that falls
      dueOffsetMonths (default 1) after the period ends. Left unset only where
      the real due date is expiry- or event-triggered rather than
      calendar-fixed (e.g. licence renewals, AGM-relative filings), in which
      case the engine falls back to a mid-period placeholder and dueRule
      remains the authoritative statement of the rule. */
  dueMonth?: number;
  dueDay?: number;
  dueOffsetMonths?: number;
  /** Overrides dueOffsetMonths for the FY's Q4 (Jan-Mar) period only. Added
      to match db/jurisdictions.ts (LMW) so the shared setup script's due-date
      engine type-checks against both tenants' data - no Suprajit library item
      sets this yet, so it has no effect on Suprajit's computed due dates. */
  dueOffsetMonthsQ4?: number;
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
  // federal / national level for every country
  { id: 'IN-FED', country: 'IN', level: 'federal', code: 'FED', name: 'India — Central' },
  { id: 'US-FED', country: 'US', level: 'federal', code: 'FED', name: 'United States — Federal' },
  { id: 'MX-FED', country: 'MX', level: 'federal', code: 'FED', name: 'Mexico — Federal' },
  { id: 'UK-FED', country: 'UK', level: 'federal', code: 'FED', name: 'United Kingdom — National' },
  { id: 'DE-FED', country: 'DE', level: 'federal', code: 'FED', name: 'Germany — Federal' },
  { id: 'HU-FED', country: 'HU', level: 'federal', code: 'FED', name: 'Hungary — National' },
  { id: 'CN-FED', country: 'CN', level: 'federal', code: 'FED', name: 'China — National' },
  { id: 'LU-FED', country: 'LU', level: 'federal', code: 'FED', name: 'Luxembourg — National' },
  { id: 'MA-FED', country: 'MA', level: 'federal', code: 'FED', name: 'Morocco — National' },
  { id: 'CA-FED', country: 'CA', level: 'federal', code: 'FED', name: 'Canada — Federal' },

  // United States — states
  { id: 'US-MI', country: 'US', parent: 'US-FED', level: 'state', code: 'MI', name: 'Michigan' },
  { id: 'US-CA', country: 'US', parent: 'US-FED', level: 'state', code: 'CA', name: 'California' },
  { id: 'US-TX', country: 'US', parent: 'US-FED', level: 'state', code: 'TX', name: 'Texas' },
  { id: 'US-OH', country: 'US', parent: 'US-FED', level: 'state', code: 'OH', name: 'Ohio' },
  { id: 'US-DE', country: 'US', parent: 'US-FED', level: 'state', code: 'DE', name: 'Delaware' },

  // India — states
  { id: 'IN-KA', country: 'IN', parent: 'IN-FED', level: 'state', code: 'KA', name: 'Karnataka' },
  { id: 'IN-UP', country: 'IN', parent: 'IN-FED', level: 'state', code: 'UP', name: 'Uttar Pradesh' },
  { id: 'IN-HR', country: 'IN', parent: 'IN-FED', level: 'state', code: 'HR', name: 'Haryana' },

  // Canada — provinces
  { id: 'CA-ON', country: 'CA', parent: 'CA-FED', level: 'province', code: 'ON', name: 'Ontario' },
  { id: 'CA-QC', country: 'CA', parent: 'CA-FED', level: 'province', code: 'QC', name: 'Quebec' },

  // Mexico — states
  { id: 'MX-QRO', country: 'MX', parent: 'MX-FED', level: 'state', code: 'QRO', name: 'Querétaro' },

  // Germany — states
  { id: 'DE-BW', country: 'DE', parent: 'DE-FED', level: 'state', code: 'BW', name: 'Baden-Württemberg' },
];

/* ------------------------------------------- sub-national compliance items */
const US_STATE: LibraryItem[] = [
  // ---------------- Michigan
  { code: 'US-MI-001', country: 'US', jurisdiction: 'US-MI', category: 'direct_tax',
    title: 'Michigan Corporate Income Tax annual return', law: 'Michigan Income Tax Act — MCL 206.601',
    form: 'Form 4891', authority: 'Michigan Department of Treasury', frequency: 'Annual',
    dueRule: 'Last day of the 4th month after the tax year end',
    dueMonth: 4, dueDay: 31,
    evidence: ['Filed return with confirmation', 'Apportionment workpapers', 'Payment confirmation'],
    penalty: '5% of tax due, increasing to 25%; interest accrues', risk: 'High' },
  { code: 'US-MI-002', country: 'US', jurisdiction: 'US-MI', category: 'direct_tax',
    title: 'Michigan CIT estimated payments', law: 'MCL 206.681', form: 'Form 4913',
    authority: 'Michigan Department of Treasury', frequency: 'Quarterly',
    dueRule: '15th day of the 4th, 7th, 10th and 13th month',
    dueDay: 15, dueOffsetMonths: 1,
    evidence: ['Payment confirmations', 'Estimate computation'], penalty: 'Interest and penalty on underpayment', risk: 'Medium' },
  { code: 'US-MI-003', country: 'US', jurisdiction: 'US-MI', category: 'vat_gst',
    title: 'Michigan sales, use and withholding return', law: 'MCL 205.56',
    form: 'Form 5080 / annual Form 5081', authority: 'Michigan Department of Treasury', frequency: 'Monthly',
    dueRule: '20th of the following month; annual reconciliation by 28 February',
    dueDay: 20, dueOffsetMonths: 1,
    evidence: ['Filed return', 'Payment confirmation', 'Exemption certificates', 'Taxability matrix'],
    penalty: '5% per month up to 25% plus interest', risk: 'High' },
  { code: 'US-MI-004', country: 'US', jurisdiction: 'US-MI', category: 'payroll_employment',
    title: 'Michigan unemployment insurance wage and tax report', law: 'Michigan Employment Security Act',
    form: 'Form UIA 1028', authority: 'Michigan Unemployment Insurance Agency', frequency: 'Quarterly',
    dueRule: '25th of the month following the quarter',
    dueDay: 25, dueOffsetMonths: 1,
    evidence: ['Filed report', 'Payment confirmation', 'Wage detail reconciliation'],
    penalty: 'Penalty and interest on late filing', risk: 'Medium' },
  { code: 'US-MI-005', country: 'US', jurisdiction: 'US-MI', category: 'corporate_law',
    title: 'Michigan annual report for corporations', law: 'Michigan Business Corporation Act',
    form: 'Annual report (CSCL/CD-2000)', authority: 'Michigan LARA — Corporations Division', frequency: 'Annual',
    dueRule: '15 May',
    dueMonth: 5, dueDay: 15, evidence: ['Filed annual report', 'Filing fee receipt', 'Good standing certificate'],
    penalty: 'Late fee; loss of good standing', risk: 'Medium' },
  { code: 'US-MI-006', country: 'US', jurisdiction: 'US-MI', category: 'environmental_ehs',
    title: 'Michigan air emissions reporting (MAERS)', law: 'Michigan NREPA Part 55',
    form: 'MAERS annual report', authority: 'Michigan EGLE', frequency: 'Annual', dueRule: '15 March',
    dueMonth: 3, dueDay: 15,
    evidence: ['Submitted MAERS report', 'Emission calculations', 'Permit conditions tracker'],
    penalty: 'Civil fines under NREPA', risk: 'Medium', factory: true },
  { code: 'US-MI-007', country: 'US', jurisdiction: 'US-MI', category: 'environmental_ehs',
    title: 'Michigan hazardous waste generator annual report', law: 'NREPA Part 111',
    form: 'Annual generator report', authority: 'Michigan EGLE', frequency: 'Annual', dueRule: '1 March',
    dueMonth: 3, dueDay: 1,
    evidence: ['Filed report', 'Manifests', 'EPA/state ID confirmation'],
    penalty: 'Civil and criminal penalties', risk: 'Medium', factory: true },

  // ---------------- California
  { code: 'US-CA-001', country: 'US', jurisdiction: 'US-CA', category: 'direct_tax',
    title: 'California franchise or income tax return', law: 'California Revenue & Taxation Code §23151',
    form: 'Form 100', authority: 'California Franchise Tax Board', frequency: 'Annual',
    dueRule: '15th day of the 4th month after the tax year end',
    dueMonth: 4, dueDay: 15,
    evidence: ['Filed return', 'Apportionment schedule (Schedule R)', 'Payment confirmation'],
    penalty: '5% per month up to 25%; USD 800 minimum franchise tax applies', risk: 'High' },
  { code: 'US-CA-002', country: 'US', jurisdiction: 'US-CA', category: 'direct_tax',
    title: 'California estimated franchise tax payments', law: 'RTC §19025', form: 'Form 100-ES',
    authority: 'California Franchise Tax Board', frequency: 'Quarterly',
    dueRule: '15 April, 15 June, 15 September, 15 December',
    dueDay: 15, dueOffsetMonths: 1,
    evidence: ['Payment confirmations', 'Estimate computation'], penalty: 'Underpayment penalty and interest', risk: 'Medium' },
  { code: 'US-CA-003', country: 'US', jurisdiction: 'US-CA', category: 'vat_gst',
    title: 'California sales and use tax return', law: 'RTC §6451',
    form: 'CDTFA-401-A', authority: 'California Department of Tax and Fee Administration', frequency: 'Quarterly',
    dueRule: 'Last day of the month following the reporting period',
    dueDay: 31, dueOffsetMonths: 1,
    evidence: ['Filed return', 'Payment confirmation', 'Resale certificates', 'District tax allocation schedule'],
    penalty: '10% penalty plus interest', risk: 'High' },
  { code: 'US-CA-004', country: 'US', jurisdiction: 'US-CA', category: 'payroll_employment',
    title: 'California payroll tax return and wage report', law: 'California Unemployment Insurance Code',
    form: 'DE 9 and DE 9C', authority: 'California Employment Development Department', frequency: 'Quarterly',
    dueRule: 'Last day of the month following the quarter',
    dueDay: 31, dueOffsetMonths: 1,
    evidence: ['Filed DE 9 / DE 9C', 'Payment confirmation (DE 88)', 'Payroll register reconciliation'],
    penalty: 'Penalty plus interest; 15% for late payment', risk: 'High' },
  { code: 'US-CA-005', country: 'US', jurisdiction: 'US-CA', category: 'payroll_employment',
    title: 'California pay data reporting', law: 'California Government Code §12999',
    form: 'Pay data report', authority: 'California Civil Rights Department', frequency: 'Annual',
    dueRule: 'Second Wednesday of May',
    dueMonth: 5, dueDay: 14,
    evidence: ['Submitted pay data report', 'Snapshot period workforce data', 'Portal confirmation'],
    penalty: 'Up to USD 100 per employee, USD 200 for repeat failures', risk: 'Medium' },
  { code: 'US-CA-006', country: 'US', jurisdiction: 'US-CA', category: 'corporate_law',
    title: 'California statement of information', law: 'California Corporations Code §1502',
    form: 'Form SI-550', authority: 'California Secretary of State', frequency: 'Annual',
    dueRule: 'By the end of the anniversary month of registration',
    evidence: ['Filed statement of information', 'Filing fee receipt'],
    penalty: 'USD 250 penalty; suspension of corporate powers', risk: 'Medium' },
  { code: 'US-CA-007', country: 'US', jurisdiction: 'US-CA', category: 'environmental_ehs',
    title: 'California Proposition 65 exposure warnings', law: 'Health & Safety Code §25249.6',
    form: 'Warning labels and notices', authority: 'California OEHHA', frequency: 'Continuous',
    dueRule: 'Warning provided before exposure occurs',
    evidence: ['Chemical assessment', 'Label artwork and placement proof', 'Supplier declarations'],
    penalty: 'Up to USD 2,500 per day per violation', risk: 'High', factory: true },
  { code: 'US-CA-008', country: 'US', jurisdiction: 'US-CA', category: 'environmental_ehs',
    title: 'California hazardous waste generator reporting and fees', law: 'California Health & Safety Code Ch. 6.5',
    form: 'Generator reporting; CUPA submissions', authority: 'CalEPA / DTSC / local CUPA', frequency: 'Annual',
    dueRule: 'Per CUPA and DTSC schedules',
    evidence: ['EPA/state ID', 'Manifests', 'CUPA inspection records', 'Fee payment confirmations'],
    penalty: 'Substantial civil penalties per day', risk: 'High', factory: true },
  { code: 'US-CA-009', country: 'US', jurisdiction: 'US-CA', category: 'data_privacy',
    title: 'CCPA/CPRA consumer privacy compliance', law: 'California Consumer Privacy Act as amended by CPRA',
    form: 'Privacy notice; DSAR workflow', authority: 'California Privacy Protection Agency', frequency: 'Continuous',
    dueRule: 'Notice updated at least every 12 months; DSAR response within 45 days',
    evidence: ['Privacy notice with update log', 'DSAR intake and response log', 'Vendor data processing agreements', 'Risk assessments'],
    penalty: 'Up to USD 7,988 per intentional violation (indexed)', risk: 'High' },

  // ---------------- Texas
  { code: 'US-TX-001', country: 'US', jurisdiction: 'US-TX', category: 'direct_tax',
    title: 'Texas franchise tax report', law: 'Texas Tax Code Chapter 171',
    form: 'Form 05-158 / 05-163', authority: 'Texas Comptroller of Public Accounts', frequency: 'Annual',
    dueRule: '15 May',
    dueMonth: 5, dueDay: 15, evidence: ['Filed report', 'Public information report (05-102)', 'Payment confirmation'],
    penalty: '5% then 10% penalty plus interest; forfeiture of charter', risk: 'High' },
  { code: 'US-TX-002', country: 'US', jurisdiction: 'US-TX', category: 'vat_gst',
    title: 'Texas sales and use tax return', law: 'Texas Tax Code Chapter 151',
    form: 'Form 01-114 / 01-117', authority: 'Texas Comptroller of Public Accounts', frequency: 'Monthly',
    dueRule: '20th of the following month',
    dueDay: 20, dueOffsetMonths: 1,
    evidence: ['Filed return', 'Payment confirmation', 'Resale and exemption certificates', 'Local tax allocation'],
    penalty: '5% then 10% penalty plus interest', risk: 'High' },
  { code: 'US-TX-003', country: 'US', jurisdiction: 'US-TX', category: 'payroll_employment',
    title: 'Texas unemployment tax wage report', law: 'Texas Unemployment Compensation Act',
    form: 'Form C-3 / C-4', authority: 'Texas Workforce Commission', frequency: 'Quarterly',
    dueRule: 'Last day of the month following the quarter',
    dueDay: 31, dueOffsetMonths: 1,
    evidence: ['Filed report', 'Payment confirmation', 'Wage detail'], penalty: 'Interest and penalty', risk: 'Medium' },
  { code: 'US-TX-004', country: 'US', jurisdiction: 'US-TX', category: 'corporate_law',
    title: 'Texas public information report', law: 'Texas Tax Code §171.203', form: 'Form 05-102',
    authority: 'Texas Comptroller of Public Accounts', frequency: 'Annual', dueRule: 'With the franchise tax report',
    dueMonth: 5, dueDay: 15,
    evidence: ['Filed report', 'Officer and director schedule'], penalty: 'Forfeiture of right to transact business', risk: 'Medium' },
  { code: 'US-TX-005', country: 'US', jurisdiction: 'US-TX', category: 'environmental_ehs',
    title: 'Texas air emissions inventory', law: '30 TAC §101.10', form: 'Emissions inventory questionnaire',
    authority: 'Texas Commission on Environmental Quality', frequency: 'Annual', dueRule: '31 March',
    dueMonth: 3, dueDay: 31,
    evidence: ['Submitted inventory', 'Emission calculations', 'Permit register'],
    penalty: 'Administrative penalties per day', risk: 'Medium', factory: true },

  // ---------------- Ohio
  { code: 'US-OH-001', country: 'US', jurisdiction: 'US-OH', category: 'direct_tax',
    title: 'Ohio commercial activity tax return', law: 'Ohio Revised Code Chapter 5751',
    form: 'Form CAT 12', authority: 'Ohio Department of Taxation', frequency: 'Quarterly',
    dueRule: '10 May, 10 August, 10 November, 10 February',
    dueDay: 10, dueOffsetMonths: 2,
    evidence: ['Filed return', 'Gross receipts computation', 'Payment confirmation'],
    penalty: 'Up to greater of USD 50 or 10% of tax', risk: 'Medium' },
  { code: 'US-OH-002', country: 'US', jurisdiction: 'US-OH', category: 'vat_gst',
    title: 'Ohio sales and use tax return', law: 'ORC Chapter 5739', form: 'Form UST-1',
    authority: 'Ohio Department of Taxation', frequency: 'Monthly', dueRule: '23rd of the following month',
    dueDay: 23, dueOffsetMonths: 1,
    evidence: ['Filed return', 'Payment confirmation', 'Exemption certificates'],
    penalty: 'Up to 15% of tax due plus interest', risk: 'High' },
  { code: 'US-OH-003', country: 'US', jurisdiction: 'US-OH', category: 'payroll_employment',
    title: 'Ohio employer withholding and unemployment reporting', law: 'ORC Chapter 5747 / 4141',
    form: 'Form IT 501 / JFS 20125', authority: 'Ohio Department of Taxation / ODJFS', frequency: 'Monthly',
    dueRule: 'Withholding by the 15th; unemployment quarterly',
    dueDay: 15, dueOffsetMonths: 1,
    evidence: ['Filed returns', 'Payment confirmations', 'Payroll reconciliation'],
    penalty: 'Penalty plus interest', risk: 'Medium' },
  { code: 'US-OH-004', country: 'US', jurisdiction: 'US-OH', category: 'payroll_employment',
    title: 'Ohio workers compensation payroll true-up', law: 'ORC Chapter 4123',
    form: 'Payroll true-up report', authority: 'Ohio Bureau of Workers Compensation', frequency: 'Annual',
    dueRule: 'Within 45 days of the policy year end',
    dueMonth: 2, dueDay: 14,
    evidence: ['Submitted true-up', 'Payroll by manual classification', 'Premium payment'],
    penalty: 'Loss of rating plan eligibility; penalties', risk: 'Medium' },
  { code: 'US-OH-005', country: 'US', jurisdiction: 'US-OH', category: 'corporate_law',
    title: 'Ohio statutory agent and registration maintenance', law: 'ORC Chapter 1703',
    form: 'Statutory agent update', authority: 'Ohio Secretary of State', frequency: 'Periodic',
    dueRule: 'On any change of agent or address',
    evidence: ['Filed agent update', 'Good standing certificate'], penalty: 'Cancellation of registration', risk: 'Low' },

  // ---------------- Delaware
  { code: 'US-DE-001', country: 'US', jurisdiction: 'US-DE', category: 'corporate_law',
    title: 'Delaware annual report and franchise tax', law: '8 Del. C. §502',
    form: 'Annual report and franchise tax', authority: 'Delaware Division of Corporations', frequency: 'Annual',
    dueRule: '1 March',
    dueMonth: 3, dueDay: 1, evidence: ['Filed annual report', 'Franchise tax payment confirmation', 'Registered agent confirmation'],
    penalty: 'USD 200 penalty plus 1.5% monthly interest; charter void', risk: 'High' },
];

const IN_STATE: LibraryItem[] = [
  { code: 'IN-KA-001', country: 'IN', jurisdiction: 'IN-KA', category: 'payroll_employment',
    title: 'Karnataka professional tax — employer and employee', law: 'Karnataka Tax on Professions Act, 1976',
    form: 'Form 5 / Form 5A', authority: 'Karnataka Commercial Taxes Department', frequency: 'Monthly',
    dueRule: '20th of the following month; annual return by 30 April',
    dueDay: 20, dueOffsetMonths: 1,
    evidence: ['Paid challan', 'Filed return', 'Employee-wise deduction register'],
    penalty: 'Interest 1.25% per month plus penalty', risk: 'Medium' },
  { code: 'IN-KA-002', country: 'IN', jurisdiction: 'IN-KA', category: 'payroll_employment',
    title: 'Karnataka labour welfare fund contribution', law: 'Karnataka Labour Welfare Fund Act, 1965',
    form: 'Form D', authority: 'Karnataka Labour Welfare Board', frequency: 'Annual',
    dueRule: '15 January for the preceding calendar year',
    dueMonth: 1, dueDay: 15,
    evidence: ['Paid challan', 'Employee contribution register', 'Filed Form D'],
    penalty: 'Penalty and interest on delayed remittance', risk: 'Low' },
  { code: 'IN-KA-003', country: 'IN', jurisdiction: 'IN-KA', category: 'payroll_employment',
    title: 'Karnataka shops and establishments registration renewal', law: 'Karnataka Shops and Commercial Establishments Act, 1961',
    form: 'Registration certificate renewal', authority: 'Karnataka Labour Department', frequency: 'Periodic',
    dueRule: 'Before expiry of the registration certificate',
    evidence: ['Valid registration certificate', 'Renewal challan', 'Display copy at premises'],
    penalty: 'Fine and prosecution', risk: 'Medium' },
  { code: 'IN-KA-004', country: 'IN', jurisdiction: 'IN-KA', category: 'environmental_ehs',
    title: 'Karnataka consent to operate — water and air', law: 'Water Act, 1974 & Air Act, 1981',
    form: 'Consent to Operate', authority: 'Karnataka State Pollution Control Board', frequency: 'Periodic',
    dueRule: 'Renewal before expiry of the consent',
    evidence: ['Valid consent order', 'Renewal application and fee', 'Monitoring reports', 'Condition compliance tracker'],
    penalty: 'Closure direction and prosecution', risk: 'Critical', factory: true },
  { code: 'IN-KA-005', country: 'IN', jurisdiction: 'IN-KA', category: 'payroll_employment',
    title: 'Karnataka Factories Act annual return', law: 'Karnataka Factories Rules, 1969',
    form: 'Form 20 / Form 21', authority: 'Karnataka Directorate of Factories', frequency: 'Annual',
    dueRule: '15 February for the preceding calendar year',
    dueMonth: 2, dueDay: 15,
    evidence: ['Filed annual return', 'Factory licence', 'Accident register', 'Health register'],
    penalty: 'Fine and imprisonment under the Factories Act', risk: 'High', factory: true },

  { code: 'IN-UP-001', country: 'IN', jurisdiction: 'IN-UP', category: 'payroll_employment',
    title: 'Uttar Pradesh labour welfare fund contribution', law: 'UP Labour Welfare Fund Act, 1965',
    form: 'State challan', authority: 'UP Labour Welfare Board', frequency: 'Half-yearly',
    dueRule: 'June and December cycles',
    dueDay: 30, dueOffsetMonths: 3,
    evidence: ['Paid challan', 'Employee contribution register'], penalty: 'Penalty and interest', risk: 'Low' },
  { code: 'IN-UP-002', country: 'IN', jurisdiction: 'IN-UP', category: 'environmental_ehs',
    title: 'Uttar Pradesh consent to operate — water and air', law: 'Water Act, 1974 & Air Act, 1981',
    form: 'Consent to Operate', authority: 'Uttar Pradesh Pollution Control Board', frequency: 'Periodic',
    dueRule: 'Renewal before expiry of the consent',
    evidence: ['Valid consent order', 'Renewal application and fee', 'Monitoring reports'],
    penalty: 'Closure direction and prosecution', risk: 'Critical', factory: true },
  { code: 'IN-UP-003', country: 'IN', jurisdiction: 'IN-UP', category: 'payroll_employment',
    title: 'Uttar Pradesh Factories Act annual return', law: 'UP Factories Rules, 1950',
    form: 'Form 22', authority: 'UP Directorate of Factories', frequency: 'Annual',
    dueRule: '31 January for the preceding calendar year',
    dueMonth: 1, dueDay: 31,
    evidence: ['Filed annual return', 'Factory licence renewal', 'Accident register'],
    penalty: 'Fine and imprisonment', risk: 'High', factory: true },
  { code: 'IN-UP-004', country: 'IN', jurisdiction: 'IN-UP', category: 'payroll_employment',
    title: 'Uttar Pradesh shops and establishments registration', law: 'UP Shops and Commercial Establishments Act, 1962',
    form: 'Registration certificate', authority: 'UP Labour Department', frequency: 'Periodic',
    dueRule: 'Renewal per state schedule',
    evidence: ['Valid registration certificate', 'Renewal challan'], penalty: 'Fine and prosecution', risk: 'Medium' },
];

const CA_PROV: LibraryItem[] = [
  { code: 'CA-ON-001', country: 'CA', jurisdiction: 'CA-ON', category: 'direct_tax',
    title: 'Ontario employer health tax return', law: 'Employer Health Tax Act (Ontario)',
    form: 'EHT annual return', authority: 'Ontario Ministry of Finance', frequency: 'Annual',
    dueRule: '15 March',
    dueMonth: 3, dueDay: 15, evidence: ['Filed return', 'Instalment payments', 'Exemption eligibility analysis'],
    penalty: 'Penalty plus interest', risk: 'Medium' },
  { code: 'CA-ON-002', country: 'CA', jurisdiction: 'CA-ON', category: 'payroll_employment',
    title: 'Ontario WSIB premium remittance and reconciliation', law: 'Workplace Safety and Insurance Act, 1997',
    form: 'Premium remittance; annual reconciliation', authority: 'Ontario WSIB', frequency: 'Annual',
    dueRule: 'Reconciliation by 31 March',
    dueMonth: 3, dueDay: 31,
    evidence: ['Premium remittances', 'Annual reconciliation', 'Assessable earnings computation', 'Clearance certificates'],
    penalty: 'Penalty plus interest; personal liability of directors', risk: 'High' },
  { code: 'CA-ON-003', country: 'CA', jurisdiction: 'CA-ON', category: 'corporate_law',
    title: 'Ontario annual return', law: 'Corporations Information Act (Ontario)',
    form: 'Ontario annual return', authority: 'Ontario Business Registry', frequency: 'Annual',
    dueRule: 'Within 6 months of the tax year end',
    dueMonth: 6, dueDay: 31,
    evidence: ['Filed annual return', 'Registry confirmation', 'Corporate profile report'],
    penalty: 'Administrative dissolution', risk: 'Medium' },
  { code: 'CA-ON-004', country: 'CA', jurisdiction: 'CA-ON', category: 'payroll_employment',
    title: 'Ontario accessibility compliance report', law: 'Accessibility for Ontarians with Disabilities Act, 2005',
    form: 'Accessibility compliance report', authority: 'Ontario Ministry for Seniors and Accessibility', frequency: 'Periodic',
    dueRule: 'Per reporting cycle',
    evidence: ['Filed compliance report', 'Accessibility policy and multi-year plan', 'Training records'],
    penalty: 'Up to CAD 100,000 per day for corporations', risk: 'Low' },
  { code: 'CA-QC-001', country: 'CA', jurisdiction: 'CA-QC', category: 'vat_gst',
    title: 'Quebec sales tax return', law: 'Act respecting the Québec sales tax',
    form: 'QST return', authority: 'Revenu Québec', frequency: 'Monthly',
    dueRule: 'One month after the reporting period end',
    dueDay: 31, dueOffsetMonths: 1,
    evidence: ['Filed QST return', 'Payment confirmation', 'Input tax refund support'],
    penalty: 'Penalty plus interest', risk: 'High' },
];

const MX_STATE: LibraryItem[] = [
  { code: 'MX-QRO-001', country: 'MX', jurisdiction: 'MX-QRO', category: 'payroll_employment',
    title: 'Querétaro state payroll tax', law: 'Ley de Hacienda del Estado de Querétaro',
    form: 'Declaración de impuesto sobre nóminas', authority: 'Secretaría de Finanzas de Querétaro', frequency: 'Monthly',
    dueRule: 'By the 22nd of the following month',
    dueDay: 22, dueOffsetMonths: 1,
    evidence: ['Filed declaration', 'Payment receipt', 'Payroll base computation'],
    penalty: 'Surcharges and fines', risk: 'Medium' },
  { code: 'MX-QRO-002', country: 'MX', jurisdiction: 'MX-QRO', category: 'environmental_ehs',
    title: 'Querétaro state environmental operating licence', law: 'Ley de Protección Ambiental del Estado de Querétaro',
    form: 'Licencia ambiental de funcionamiento', authority: 'SEDESU Querétaro', frequency: 'Annual',
    dueRule: 'Annual renewal and reporting per licence',
    evidence: ['Valid licence', 'Annual report', 'Emission and waste records'],
    penalty: 'Fines and closure', risk: 'High', factory: true },
];

const DE_STATE: LibraryItem[] = [
  { code: 'DE-BW-001', country: 'DE', jurisdiction: 'DE-BW', category: 'environmental_ehs',
    title: 'Baden-Württemberg emissions declaration', law: '11. BImSchV (Emissionserklärungsverordnung)',
    form: 'Emissionserklärung', authority: 'Regierungspräsidium Baden-Württemberg', frequency: 'Periodic',
    dueRule: 'Every four years by 31 May for the reporting year',
    dueMonth: 5, dueDay: 31,
    evidence: ['Submitted declaration', 'Emission measurements', 'Plant permit register'],
    penalty: 'Administrative fines', risk: 'Medium', factory: true },
  { code: 'DE-BW-002', country: 'DE', jurisdiction: 'DE-BW', category: 'environmental_ehs',
    title: 'Baden-Württemberg waste and water authority reporting', law: 'Landeswassergesetz BW / KrWG',
    form: 'Betreiberberichte', authority: 'Landratsamt / Regierungspräsidium', frequency: 'Annual',
    dueRule: 'Per permit conditions',
    evidence: ['Permits', 'Monitoring reports', 'Waste register', 'Company waste officer appointment'],
    penalty: 'Fines and operating restrictions', risk: 'Medium', factory: true },
];

export const SUBNATIONAL_LIBRARY: LibraryItem[] = [
  ...US_STATE, ...IN_STATE, ...CA_PROV, ...MX_STATE, ...DE_STATE,
];
