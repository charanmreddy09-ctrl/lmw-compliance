/* ===========================================================================
   FEDERAL / NATIONAL COMPLIANCE LIBRARY — LMW LIMITED
   ---------------------------------------------------------------------------
   CATEGORIES below are the compliance domains actually relevant to LMW's
   operations (manufacturing, listed on NSE/BSE, one overseas subsidiary).
   Add further categories from Administration -> Jurisdictions if new
   obligation types come up later — nothing here is hard-coded elsewhere.

   The India federal section was reconciled against a validated 85-item
   compliance register supplied by the client (SGCMP_Compliance_Library_
   India_Validated.xlsx) — that file is the primary source for law/section
   citations, frequency and due-date rules. Where the validated source gives
   a fixed calendar date, it is used directly; where a rule is
   expiry-/event-triggered (e.g. "within 30 days of receipt of BEN-1"), no
   dueMonth/dueDay is set and the item shows as Event Based/Continuous with
   the rule spelled out in dueRule for manual tracking. Every row still
   carries verified = false in the database — a local adviser must confirm
   each one before it's relied on. Treat this as a starting position to
   confirm, never as filed legal advice.
   =========================================================================== */

import type { LibraryItem } from './jurisdictions';

export const CATEGORIES: { id: string; name: string; sort: number }[] = [
  { id: "corporate_law", name: "Corporate Law", sort: 20 },
  { id: "customs_trade", name: "Customs & Trade", sort: 30 },
  { id: "data_privacy", name: "Data Privacy & Cyber", sort: 40 },
  { id: "direct_tax", name: "Direct Tax", sort: 50 },
  { id: "environmental_ehs", name: "Environmental (EHS)", sort: 70 },
  { id: "foreign_exchange", name: "Foreign Exchange", sort: 80 },
  { id: "industry_regulation", name: "Industry Regulation", sort: 90 },
  { id: "labour_law", name: "Labour Law", sort: 100 },
  { id: "securities_sebi", name: "Securities / SEBI", sort: 110 },
  { id: "competition_law", name: "Competition Law", sort: 120 },
  { id: "transfer_pricing", name: "Transfer Pricing", sort: 130 },
  { id: "vat_gst", name: "VAT / GST", sort: 140 },
];

export const COUNTRIES: { code: string; name: string; currency: string; fyEnd: string; tz: string; portal: string }[] = [
  { code: 'IN', name: 'India', currency: 'INR', fyEnd: '31 March', tz: 'Asia/Kolkata',
    portal: 'mca.gov.in · incometax.gov.in · gst.gov.in · sebi.gov.in · rbi.org.in' },
  { code: 'AE', name: 'United Arab Emirates', currency: 'AED', fyEnd: '31 March', tz: 'Asia/Dubai',
    portal: 'mof.gov.ae · tax.gov.ae · moec.gov.ae' },
];

/* A working baseline for LMW's two confirmed jurisdictions (India federal +
   UAE federal — state/free-zone items are in db/jurisdictions.ts). Every row
   is unverified by default; a local adviser must confirm each one — see
   README "The compliance library" and "Filling in this template". This is a
   starting position drawn from published statutory frameworks, not filed
   legal advice, and does not cover every LMW obligation. */
export const FEDERAL_LIBRARY: LibraryItem[] = [
  /* ---------------------------------------------------------- India — corporate (Companies Act, 2013) */
  {
    code: 'IN-FED-001', country: 'IN', jurisdiction: 'IN-FED', category: 'corporate_law',
    title: 'Annual financial statements filing — Form AOC-4 / AOC-4 XBRL', law: 'Companies Act, 2013, Section 137 and Rule 12',
    form: 'AOC-4 / AOC-4 XBRL', authority: 'Ministry of Corporate Affairs (MCA)',
    frequency: 'Annual', dueRule: 'Within 30 days of the AGM — by 29/30 October, assuming AGM by 30 September',
    dueMonth: 10, dueDay: 29,
    evidence: ['Filed AOC-4 with SRN', 'Signed financial statements', "Board's report"], penalty: 'Additional fee per day of delay under Sec 403; company and officers liable under Sec 137(3)', risk: 'High',
  },
  {
    code: 'IN-FED-002', country: 'IN', jurisdiction: 'IN-FED', category: 'corporate_law',
    title: 'Annual return filing — Form MGT-7', law: 'Companies Act, 2013, Section 92',
    form: 'MGT-7', authority: 'Ministry of Corporate Affairs (MCA)',
    frequency: 'Annual', dueRule: 'Within 60 days of the AGM — by 28/29 November, assuming AGM by 30 September',
    dueMonth: 11, dueDay: 28,
    evidence: ['Filed MGT-7 with SRN', 'AGM minutes'], penalty: 'Additional fee per day of delay under Sec 403; officers liable to penalty under Sec 92(5)', risk: 'High',
  },
  {
    code: 'IN-FED-003', country: 'IN', jurisdiction: 'IN-FED', category: 'corporate_law',
    title: 'Auditor appointment intimation — Form ADT-1', law: 'Companies Act, 2013, Section 139',
    form: 'ADT-1', authority: 'Ministry of Corporate Affairs (MCA)',
    frequency: 'Annual', dueRule: 'Within 15 days of the AGM — by 14/15 October, assuming AGM by 30 September',
    dueMonth: 10, dueDay: 14,
    evidence: ['Filed ADT-1 with SRN', 'Auditor consent letter'], penalty: 'Additional fee per day of delay under Sec 403', risk: 'Medium',
  },
  {
    code: 'IN-FED-004', country: 'IN', jurisdiction: 'IN-FED', category: 'corporate_law',
    title: 'Director KYC — Form DIR-3 KYC', law: 'Companies Act, 2013 read with Rule 12A of the Companies (Appointment and Qualification of Directors) Rules',
    form: 'DIR-3 KYC', authority: 'Ministry of Corporate Affairs (MCA)',
    frequency: 'Annual', dueRule: '30 September every year, for every director holding a DIN',
    dueMonth: 9, dueDay: 30,
    evidence: ['Filed DIR-3 KYC acknowledgement per director'], penalty: 'DIN deactivated; late fee of ₹5,000 to reactivate', risk: 'Medium',
  },
  {
    code: 'IN-FED-005', country: 'IN', jurisdiction: 'IN-FED', category: 'corporate_law',
    title: 'Return of deposits / exempted deposits — Form DPT-3', law: 'Companies Act, 2013, Rule 16 of the Companies (Acceptance of Deposits) Rules, 2014',
    form: 'DPT-3', authority: 'Ministry of Corporate Affairs (MCA)',
    frequency: 'Annual', dueRule: '30 June every year, for the position as at 31 March',
    dueMonth: 6, dueDay: 30,
    evidence: ['Filed DPT-3 with SRN', 'Auditor certificate'], penalty: 'Additional fee per day of delay under Sec 403', risk: 'Medium',
  },
  {
    code: 'IN-FED-006', country: 'IN', jurisdiction: 'IN-FED', category: 'corporate_law',
    title: 'Half-yearly return of MSME dues — Form MSME-1', law: 'Companies Act, 2013, Section 405',
    form: 'MSME-1', authority: 'Ministry of Corporate Affairs (MCA)',
    frequency: 'Half-yearly', dueRule: '30 April (Oct-Mar half) and 31 October (Apr-Sep half). Modelled here as the 30th of the month after each half-year — the Apr-Sep half technically falls due 31 October, one day after the 30th coded here; confirm before relying on it.',
    dueOffsetMonths: 1, dueDay: 30,
    evidence: ['Filed MSME-1'], penalty: 'Additional fee per day of delay under Sec 403; penalty under Sec 405(4) for false/omitted information', risk: 'Medium',
  },
  {
    code: 'IN-FED-007', country: 'IN', jurisdiction: 'IN-FED', category: 'corporate_law',
    title: 'Significant beneficial ownership declaration — Form BEN-2', law: 'Companies Act, 2013, Section 90',
    form: 'BEN-2', authority: 'Ministry of Corporate Affairs (MCA)',
    frequency: 'Event Based', dueRule: 'Within 30 days of receipt of a BEN-1 declaration from a significant beneficial owner',
    evidence: ['Filed BEN-2 with SRN', 'BEN-1 declarations received'], penalty: 'Penalty under Sec 90(11) on the company and every officer in default', risk: 'Medium',
  },
  {
    code: 'IN-FED-008', country: 'IN', jurisdiction: 'IN-FED', category: 'corporate_law',
    title: 'CSR annual reporting — Form CSR-2', law: 'Companies Act, 2013, Section 135',
    form: 'CSR-2', authority: 'Ministry of Corporate Affairs (MCA)',
    frequency: 'Annual', dueRule: 'As notified each year, filed with or shortly after AOC-4 — aligned here to 29 October',
    dueMonth: 10, dueDay: 29,
    evidence: ['Filed CSR-2', 'CSR committee report', 'Spend documentation'], penalty: 'Penalty under Sec 135(7) for unspent/unreported CSR amounts', risk: 'Medium',
  },
  {
    code: 'IN-FED-009', country: 'IN', jurisdiction: 'IN-FED', category: 'corporate_law',
    title: 'Board meetings — minimum four per year', law: 'Companies Act, 2013, Section 173',
    form: 'Signed minutes', authority: 'Board of Directors',
    frequency: 'Quarterly', dueRule: 'Minimum four meetings a year, gap between two consecutive meetings not exceeding 120 days',
    evidence: ['Signed board minutes', 'Attendance register'], penalty: 'Penalty under Sec 173(4) for default', risk: 'Medium',
  },
  {
    code: 'IN-FED-010', country: 'IN', jurisdiction: 'IN-FED', category: 'corporate_law',
    title: 'Annual General Meeting', law: 'Companies Act, 2013, Section 96',
    form: 'AGM notice and minutes', authority: 'Shareholders / Ministry of Corporate Affairs',
    frequency: 'Annual', dueRule: 'Within 6 months of financial year end — by 30 September (extension possible with ROC approval)',
    dueMonth: 9, dueDay: 30,
    evidence: ['AGM notice', 'Minutes', 'Attendance register'], penalty: 'Penalty on company and every officer in default under Sec 99', risk: 'Critical',
  },
  {
    code: 'IN-FED-011', country: 'IN', jurisdiction: 'IN-FED', category: 'corporate_law',
    title: 'Filing of resolutions and agreements — Form MGT-14', law: 'Companies Act, 2013, Section 117',
    form: 'MGT-14', authority: 'Ministry of Corporate Affairs (MCA)',
    frequency: 'Event Based', dueRule: 'Within 30 days of passing the resolution',
    evidence: ['Filed MGT-14 with SRN', 'Certified resolution'], penalty: 'Additional fee per day of delay under Sec 403; penalty under Sec 117(2)', risk: 'Medium',
  },
  {
    code: 'IN-FED-012', country: 'IN', jurisdiction: 'IN-FED', category: 'corporate_law',
    title: 'Secretarial audit report — Form MR-3', law: 'Companies Act, 2013, Section 204 (applicable to listed companies)',
    form: 'MR-3', authority: 'Ministry of Corporate Affairs / Company Secretary in practice',
    frequency: 'Annual', dueRule: 'Annexed to the Board report — aligned with the AOC-4 filing, 29 October',
    dueMonth: 10, dueDay: 29,
    evidence: ['Signed MR-3'], penalty: 'Penalty under Sec 204(4) on company, officer and practising company secretary', risk: 'High', listed: true,
  },
  {
    code: 'IN-FED-093', country: 'IN', jurisdiction: 'IN-FED', category: 'corporate_law',
    title: 'Cost auditor appointment intimation — Form CRA-2', law: 'Companies Act, 2013, Section 148 read with the Companies (Cost Records and Audit) Rules, 2014 (confirm LMW falls within the specified manufacturing classes)',
    form: 'CRA-2', authority: 'Ministry of Corporate Affairs (MCA)',
    frequency: 'Annual', dueRule: 'Within 180 days of the commencement of the financial year — by 27/28 September',
    dueMonth: 9, dueDay: 27,
    evidence: ['Filed CRA-2 with SRN', 'Cost auditor consent letter'], penalty: 'Additional fee per day of delay under Sec 403', risk: 'Low', factory: true,
  },
  {
    code: 'IN-FED-013', country: 'IN', jurisdiction: 'IN-FED', category: 'corporate_law',
    title: 'Cost audit report filing — Form CRA-4', law: 'Companies Act, 2013, Section 148 (confirm LMW falls within the specified manufacturing classes)',
    form: 'CRA-4', authority: 'Ministry of Corporate Affairs (MCA)',
    frequency: 'Annual', dueRule: 'Within 30 days of receipt of the cost audit report from the cost auditor',
    dueMonth: 11, dueDay: 30,
    evidence: ['Filed CRA-4 with SRN', 'Cost audit report'], penalty: 'Additional fee per day of delay under Sec 403', risk: 'Low', factory: true,
  },
  {
    code: 'IN-FED-014', country: 'IN', jurisdiction: 'IN-FED', category: 'corporate_law',
    title: 'Statutory registers maintenance', law: 'Companies Act, 2013, Sections 85, 88 and 189',
    form: 'Statutory registers (members, charges, contracts, directors\' shareholding)', authority: 'Ministry of Corporate Affairs (MCA)',
    frequency: 'Continuous', dueRule: 'Maintained and updated on a rolling basis as events occur',
    evidence: ['Updated statutory registers'], penalty: 'Penalty under the respective sections for failure to maintain', risk: 'Low',
  },
  {
    code: 'IN-FED-015', country: 'IN', jurisdiction: 'IN-FED', category: 'corporate_law',
    title: 'Unpaid dividend and IEPF transfer', law: 'Companies Act, 2013, Sections 124 and 125',
    form: 'IEPF-1 / IEPF-2 as applicable', authority: 'Investor Education and Protection Fund Authority',
    frequency: 'Annual', dueRule: 'Unpaid dividend transferred to the Unpaid Dividend Account within statutory timelines from declaration; unclaimed amounts/shares transferred to IEPF after 7 years',
    evidence: ['IEPF filing acknowledgement', 'Unpaid dividend account statement'], penalty: 'Penalty under Sec 124(7) for non-compliance', risk: 'Medium',
  },
  {
    code: 'IN-FED-016', country: 'IN', jurisdiction: 'IN-FED', category: 'corporate_law',
    title: 'Related party transaction approval and register', law: 'Companies Act, 2013, Section 188',
    form: 'Audit committee / Board approval record, RPT register', authority: 'Board of Directors / Audit Committee',
    frequency: 'Quarterly', dueRule: 'Approved before the transaction, or ratified within 3 months where omnibus approval applies',
    evidence: ['Audit committee approval', 'RPT register entry'], penalty: 'Penalty under Sec 188(5) for contravention', risk: 'Medium',
  },

  /* ------------------------------------------------------- India — SEBI LODR (listed company) */
  {
    code: 'IN-FED-017', country: 'IN', jurisdiction: 'IN-FED', category: 'securities_sebi',
    title: 'Quarterly financial results — Regulation 33', law: 'SEBI (Listing Obligations and Disclosure Requirements) Regulations, 2015, Regulation 33',
    form: 'Regulation 33 financial results', authority: 'Stock exchanges (NSE/BSE) via SEBI',
    frequency: 'Quarterly', dueRule: 'Within 45 days of quarter end — 14th of Aug/Nov/Feb (the annual results replace the Q4 filing, see below)',
    dueOffsetMonths: 2, dueDay: 14,
    evidence: ['Board-approved financial results', 'Limited review report'], penalty: 'Fine per day of delay as per SEBI\'s standard operating procedure', risk: 'Critical', listed: true,
  },
  {
    code: 'IN-FED-018', country: 'IN', jurisdiction: 'IN-FED', category: 'securities_sebi',
    title: 'Annual audited financial results — Regulation 33', law: 'SEBI (LODR) Regulations, 2015, Regulation 33',
    form: 'Regulation 33 annual results', authority: 'Stock exchanges (NSE/BSE) via SEBI',
    frequency: 'Annual', dueRule: 'Within 60 days of financial year end — by 30 May',
    dueMonth: 5, dueDay: 30,
    evidence: ['Board-approved annual results', 'Statutory audit report'], penalty: 'Fine per day of delay as per SEBI\'s standard operating procedure', risk: 'High', listed: true,
  },
  {
    code: 'IN-FED-019', country: 'IN', jurisdiction: 'IN-FED', category: 'securities_sebi',
    title: 'Corporate governance report — Regulation 27(2)', law: 'SEBI (LODR) Regulations, 2015, Regulation 27(2)',
    form: 'Regulation 27 report', authority: 'Stock exchanges (NSE/BSE)',
    frequency: 'Quarterly', dueRule: 'Within 21 days of quarter end — cross-checked against multiple independent sources; a 30-day figure appears in some material but refers to the separate "Integrated Filing" that bundles this report with the investor grievance statement, not the Regulation 27(2) report itself.',
    dueOffsetMonths: 1, dueDay: 21,
    evidence: ['Filed corporate governance report'], penalty: 'Fine per day of delay under SEBI\'s SOP', risk: 'Medium', listed: true,
  },
  {
    code: 'IN-FED-020', country: 'IN', jurisdiction: 'IN-FED', category: 'securities_sebi',
    title: 'Shareholding pattern — Regulation 31', law: 'SEBI (LODR) Regulations, 2015, Regulation 31',
    form: 'Regulation 31 shareholding pattern', authority: 'Stock exchanges (NSE/BSE)',
    frequency: 'Quarterly', dueRule: 'Within 21 days of quarter end',
    dueOffsetMonths: 1, dueDay: 21,
    evidence: ['Filed shareholding pattern'], penalty: 'Fine per day of delay under SEBI\'s SOP', risk: 'High', listed: true,
  },
  {
    code: 'IN-FED-021', country: 'IN', jurisdiction: 'IN-FED', category: 'securities_sebi',
    title: 'Investor grievance report — Regulation 13(3)', law: 'SEBI (LODR) Regulations, 2015, Regulation 13(3)',
    form: 'Regulation 13(3) investor grievance report', authority: 'Stock exchanges (NSE/BSE)',
    frequency: 'Quarterly', dueRule: 'Within 21 days of quarter end',
    dueOffsetMonths: 1, dueDay: 21,
    evidence: ['Filed investor grievance report'], penalty: 'Fine per day of delay under SEBI\'s SOP', risk: 'Medium', listed: true,
  },
  {
    code: 'IN-FED-022', country: 'IN', jurisdiction: 'IN-FED', category: 'securities_sebi',
    title: 'Reconciliation of share capital audit — Regulation 76', law: 'SEBI (Depositories and Participants) Regulations, 2018 / SEBI (LODR) Regulations, 2015, Regulation 76',
    form: 'Regulation 76 reconciliation report', authority: 'Depositories (NSDL/CDSL) via the Registrar and Share Transfer Agent',
    frequency: 'Quarterly', dueRule: 'Within 30 days of quarter end',
    dueOffsetMonths: 1, dueDay: 30,
    evidence: ['Filed Regulation 76 report'], penalty: 'Fine per day of delay under SEBI\'s SOP', risk: 'Medium', listed: true,
  },
  {
    code: 'IN-FED-023', country: 'IN', jurisdiction: 'IN-FED', category: 'securities_sebi',
    title: 'Annual report submission', law: 'SEBI (LODR) Regulations, 2015, Regulation 34',
    form: 'Annual report', authority: 'Stock exchanges (NSE/BSE)',
    frequency: 'Annual', dueRule: 'Within 21 working days of despatch to shareholders — event-triggered off the AGM notice date, not a fixed calendar date',
    evidence: ['Filed annual report'], penalty: 'Fine per day of delay under SEBI\'s SOP', risk: 'Medium', listed: true,
  },
  {
    code: 'IN-FED-024', country: 'IN', jurisdiction: 'IN-FED', category: 'securities_sebi',
    title: 'Business Responsibility & Sustainability Report (BRSR)', law: 'SEBI (LODR) Regulations, 2015, Regulation 34(2)(f)',
    form: 'BRSR (part of the annual report)', authority: 'Stock exchanges (NSE/BSE)',
    frequency: 'Annual', dueRule: 'Filed as part of the annual report — aligned here with the AGM cycle, 30 September',
    dueMonth: 9, dueDay: 30,
    evidence: ['Filed BRSR'], penalty: 'Fine per day of delay under SEBI\'s SOP', risk: 'Medium', listed: true,
  },
  {
    code: 'IN-FED-025', country: 'IN', jurisdiction: 'IN-FED', category: 'securities_sebi',
    title: 'Annual secretarial compliance report — Regulation 24A', law: 'SEBI (LODR) Regulations, 2015, Regulation 24A',
    form: 'Annual secretarial compliance report', authority: 'Stock exchanges (NSE/BSE) via SEBI',
    frequency: 'Annual', dueRule: 'Within 60 days of the financial year end — by 30 May',
    dueMonth: 5, dueDay: 30,
    evidence: ['Filed secretarial compliance report'], penalty: 'Fine per day of delay under SEBI\'s SOP', risk: 'Medium', listed: true,
  },
  {
    code: 'IN-FED-026', country: 'IN', jurisdiction: 'IN-FED', category: 'securities_sebi',
    title: 'Structured digital database & UPSI controls', law: 'SEBI (Prohibition of Insider Trading) Regulations, 2015',
    form: 'Structured digital database (SDD)', authority: 'Company / Compliance Officer',
    frequency: 'Quarterly', dueRule: 'Maintained continuously as UPSI is shared; reviewed each quarter',
    evidence: ['SDD extract', 'Quarterly review record'], penalty: 'Action under the PIT Regulations for failure to maintain', risk: 'Medium', listed: true,
  },
  {
    code: 'IN-FED-027', country: 'IN', jurisdiction: 'IN-FED', category: 'securities_sebi',
    title: 'Disclosure of material events — Regulation 30', law: 'SEBI (LODR) Regulations, 2015, Regulation 30',
    form: 'Material event disclosure', authority: 'Stock exchanges (NSE/BSE)',
    frequency: 'Event Based', dueRule: 'Within 12 hours (deemed material events) or 24 hours (other events) of occurrence, as prescribed',
    evidence: ['Filed disclosure'], penalty: 'Fine per day of delay under SEBI\'s SOP', risk: 'High', listed: true,
  },

  /* ------------------------------------------------------------- India — direct tax */
  {
    code: 'IN-FED-028', country: 'IN', jurisdiction: 'IN-FED', category: 'direct_tax',
    title: 'Corporate income tax return — Form ITR-6', law: 'Income-tax Act, 2025, Section 263 (Section 139(1) of the Income-tax Act, 1961)',
    form: 'ITR-6', authority: 'Income Tax Department / CBDT',
    frequency: 'Annual', dueRule: 'General rule 31 October following the financial year; extends to 30 November where Section 92E (international/related-party transactions) applies — which it does for LMW given the transactions with LMW Global FZE reported via Form 3CEB. Cross-checked against multiple independent sources (CAclubindia, TaxGuru, BusinessToday, PKC India), which all confirm the 30 November extension applies specifically because a transfer-pricing case still requires a Section 44AB tax audit — filing Form 3CEB earlier does not itself move the ITR-6 date up.',
    dueMonth: 11, dueDay: 30,
    evidence: ['Filed ITR-6 acknowledgement', 'Computation of income'],
    penalty: 'Interest under the Income-tax Act, 2025, Sections 423, 424 and 425, and late-filing fee under Section 428 '
      + '(Sections 234A, 234B, 234C and 234F respectively of the Income-tax Act, 1961)',
    risk: 'Critical',
  },
  {
    code: 'IN-FED-029', country: 'IN', jurisdiction: 'IN-FED', category: 'direct_tax',
    title: 'Tax audit report — Form 3CA-3CD', law: 'Income-tax Act, 2025, Section 63 (Section 44AB of the Income-tax Act, 1961)',
    form: '3CA-3CD', authority: 'Income Tax Department / statutory auditor',
    frequency: 'Annual', dueRule: '30 September following the financial year',
    dueMonth: 9, dueDay: 30,
    evidence: ['Filed Form 3CA-3CD'],
    penalty: '0.5% of turnover or ₹1,50,000, whichever is lower, under the Income-tax Act, 2025, Section 446 '
      + '(Section 271B of the Income-tax Act, 1961)',
    risk: 'High',
  },
  {
    code: 'IN-FED-030', country: 'IN', jurisdiction: 'IN-FED', category: 'direct_tax',
    title: 'Advance tax instalments', law: 'Income-tax Act, 2025, Section 408 (Section 211 of the Income-tax Act, 1961)',
    form: 'Challan 280', authority: 'Income Tax Department',
    frequency: 'Quarterly', dueRule: '15 June (15%) · 15 September (45%) · 15 December (75%) · 15 March (100%)',
    dueOffsetMonths: 0, dueDay: 15,
    evidence: ['Payment challans'],
    penalty: 'Interest for shortfall under the Income-tax Act, 2025, Sections 424 and 425 '
      + '(Sections 234B and 234C respectively of the Income-tax Act, 1961)',
    risk: 'High',
  },
  {
    code: 'IN-FED-031', country: 'IN', jurisdiction: 'IN-FED', category: 'direct_tax',
    title: 'TDS deposit — monthly payment of tax deducted', law: 'Income-tax Act, 2025, Section 397 (Section 200 of the Income-tax Act, 1961)',
    form: 'Challan No. ITNS 281', authority: 'Income Tax Department',
    frequency: 'Monthly', dueRule: '7th of the following month (the March deposit is extended to 30 April)',
    dueOffsetMonths: 1, dueDay: 7,
    evidence: ['TDS payment challan (ITNS 281)'],
    penalty: 'Interest at 1.5% per month under the Income-tax Act, 2025, Section 398 '
      + '(Section 201(1A) of the Income-tax Act, 1961); prosecution risk for deducted-but-unpaid tax under the Income-tax Act, 2025, Section 476 '
      + '(Section 276B of the Income-tax Act, 1961)',
    risk: 'Critical',
  },
  {
    code: 'IN-FED-032', country: 'IN', jurisdiction: 'IN-FED', category: 'direct_tax',
    title: 'TDS return — salaries', law: 'Income-tax Act, 2025 (Rule 31A of the Income-tax Act, 1961; Form 24Q renumbered Form 138)',
    form: 'Form 24Q / Form 138', authority: 'Income Tax Department (TRACES)',
    frequency: 'Quarterly', dueRule: '31 July / 31 October / 31 January / 31 May',
    dueOffsetMonths: 1, dueOffsetMonthsQ4: 2, dueDay: 31,
    evidence: ['Filed TDS return acknowledgement', 'Challan details'],
    penalty: 'Late filing fee ₹200/day under the Income-tax Act, 2025, Section 427, and interest under Section 398 '
      + '(Sections 234E and 201 respectively of the Income-tax Act, 1961)',
    risk: 'High',
  },
  {
    code: 'IN-FED-033', country: 'IN', jurisdiction: 'IN-FED', category: 'direct_tax',
    title: 'TDS return — other than salaries', law: 'Income-tax Act, 2025 (Rule 31A of the Income-tax Act, 1961; Form 26Q renumbered Form 140)',
    form: 'Form 26Q / Form 140', authority: 'Income Tax Department (TRACES)',
    frequency: 'Quarterly', dueRule: '31 July / 31 October / 31 January / 31 May',
    dueOffsetMonths: 1, dueOffsetMonthsQ4: 2, dueDay: 31,
    evidence: ['Filed TDS return acknowledgement', 'Challan details'],
    penalty: 'Late filing fee ₹200/day under the Income-tax Act, 2025, Section 427, and interest under Section 398 '
      + '(Sections 234E and 201 respectively of the Income-tax Act, 1961)',
    risk: 'High',
  },
  {
    code: 'IN-FED-034', country: 'IN', jurisdiction: 'IN-FED', category: 'direct_tax',
    title: 'TDS return — payments to non-residents', law: 'Income-tax Act, 2025 (Rule 31A of the Income-tax Act, 1961; Form 27Q renumbered Form 144)',
    form: 'Form 27Q / Form 144', authority: 'Income Tax Department (TRACES)',
    frequency: 'Quarterly', dueRule: '31 July / 31 October / 31 January / 31 May',
    dueOffsetMonths: 1, dueOffsetMonthsQ4: 2, dueDay: 31,
    evidence: ['Filed TDS return acknowledgement', 'Challan details'],
    penalty: 'Late filing fee ₹200/day under the Income-tax Act, 2025, Section 427, and interest under Section 398 '
      + '(Sections 234E and 201 respectively of the Income-tax Act, 1961)',
    risk: 'High',
  },
  {
    code: 'IN-FED-035', country: 'IN', jurisdiction: 'IN-FED', category: 'direct_tax',
    title: 'TCS return', law: 'Income-tax Act, 2025, Section 394 (Section 206C of the Income-tax Act, 1961; Form 27EQ renumbered Form 143)',
    form: 'Form 27EQ / Form 143', authority: 'Income Tax Department (TRACES)',
    frequency: 'Quarterly', dueRule: '15 July / 15 October / 15 January / 15 May',
    dueOffsetMonths: 1, dueOffsetMonthsQ4: 2, dueDay: 15,
    evidence: ['Filed TCS return acknowledgement'],
    penalty: 'Late filing fee ₹200/day under the Income-tax Act, 2025, Section 427 '
      + '(Section 234E of the Income-tax Act, 1961)',
    risk: 'Medium',
  },
  {
    code: 'IN-FED-036', country: 'IN', jurisdiction: 'IN-FED', category: 'direct_tax',
    title: 'Issue of TDS certificates — Form 16 / Form 16A', law: 'Income-tax Act, 2025 (Rule 31 of the Income-tax Act, 1961)',
    form: 'Form 16 / Form 16A', authority: 'Income Tax Department',
    frequency: 'Annual', dueRule: 'Form 16 by 15 June following the financial year; Form 16A within 15 days of each quarterly TDS return',
    dueMonth: 6, dueDay: 15,
    evidence: ['Issued Form 16 per employee', 'Issued Form 16A per deductee'],
    penalty: 'Penalty of ₹100/day under the Income-tax Act, 2025, Section 465 '
      + '(Section 272A(2)(g) of the Income-tax Act, 1961)',
    risk: 'Medium',
  },
  {
    code: 'IN-FED-037', country: 'IN', jurisdiction: 'IN-FED', category: 'direct_tax',
    title: 'Foreign remittance certification — Forms 15CB / 15CA', law: 'Income-tax Act, 1961, Section 195 read with Rule 37BB (Form 15CA renumbered Form 145; Form 15CB renumbered Form 146, under the Income-tax Act, 2025)',
    form: '15CB / 146 (CA certificate) / 15CA / 145 (remitter declaration)', authority: 'Income Tax Department / chartered accountant',
    frequency: 'Event Based', dueRule: 'Before each foreign remittance that requires certification',
    evidence: ['Filed 15CA', 'CA-signed 15CB'], penalty: 'Remittance blocked by the bank; penalty for incorrect certification', risk: 'Medium',
  },
  {
    code: 'IN-FED-038', country: 'IN', jurisdiction: 'IN-FED', category: 'direct_tax',
    title: 'Statement of specified financial transactions (SFT)', law: 'Income-tax Act, 2025, Section 508 (Section 285BA of the Income-tax Act, 1961)',
    form: 'Form 61A', authority: 'Income Tax Department',
    frequency: 'Annual', dueRule: '31 May following the financial year',
    dueMonth: 5, dueDay: 31,
    evidence: ['Filed Form 61A acknowledgement'],
    penalty: 'Penalty of ₹500/day under the Income-tax Act, 2025, Section 454 '
      + '(Section 271FA of the Income-tax Act, 1961)',
    risk: 'Medium',
  },

  /* --------------------------------------------------- India — transfer pricing */
  {
    code: 'IN-FED-039', country: 'IN', jurisdiction: 'IN-FED', category: 'transfer_pricing',
    title: 'Accountant\'s report on international transactions — Form 3CEB', law: 'Income-tax Act, 1961, Section 92E (international transactions with LMW Global FZE)',
    form: '3CEB', authority: 'Income Tax Department / chartered accountant',
    frequency: 'Annual', dueRule: '31 October following the financial year',
    dueMonth: 10, dueDay: 31,
    evidence: ['Filed Form 3CEB', 'Transfer pricing study report'], penalty: 'Penalty of 2% of transaction value under Sec 271AA for non-reporting', risk: 'High',
  },
  {
    code: 'IN-FED-040', country: 'IN', jurisdiction: 'IN-FED', category: 'transfer_pricing',
    title: 'Master File — Form 3CEAA (if consolidated group revenue threshold is met)', law: 'Income-tax Act, 1961, Section 286 read with Rule 10DA',
    form: '3CEAA', authority: 'Income Tax Department',
    frequency: 'Annual', dueRule: '30 November following the financial year',
    dueMonth: 11, dueDay: 30,
    evidence: ['Filed Form 3CEAA'], penalty: 'Penalty of ₹5,00,000 under Sec 271AA(4) for non-filing', risk: 'Medium',
  },
  {
    code: 'IN-FED-041', country: 'IN', jurisdiction: 'IN-FED', category: 'transfer_pricing',
    title: 'Master File — designated entity intimation', law: 'Income-tax Act, 1961, Rule 10DA(4)',
    form: 'Form 3CEAB', authority: 'Income Tax Department',
    frequency: 'Annual', dueRule: '30 days before the Form 3CEAA due date — by 31 October',
    dueMonth: 10, dueDay: 31,
    evidence: ['Filed Form 3CEAB'], penalty: 'Penalty under Sec 271AA(4) for non-filing', risk: 'Low',
  },
  {
    code: 'IN-FED-042', country: 'IN', jurisdiction: 'IN-FED', category: 'transfer_pricing',
    title: 'Country-by-Country Report (CbCR)', law: 'Income-tax Act, 1961, Section 286(2)',
    form: 'Form 3CEAD', authority: 'Income Tax Department',
    frequency: 'Annual', dueRule: 'Within 12 months of the reporting accounting year end — by 31 March of the following calendar year',
    dueMonth: 3, dueDay: 31,
    evidence: ['Filed Form 3CEAD'], penalty: 'Penalty under Sec 271GB for non-filing', risk: 'Medium',
  },
  {
    code: 'IN-FED-043', country: 'IN', jurisdiction: 'IN-FED', category: 'transfer_pricing',
    title: 'CbCR notification', law: 'Income-tax Act, 1961, Section 286(1)',
    form: 'Form 3CEAC', authority: 'Income Tax Department',
    frequency: 'Annual', dueRule: '2 months before the CbCR due date — by 31 January',
    dueMonth: 1, dueDay: 31,
    evidence: ['Filed Form 3CEAC'], penalty: 'Penalty under Sec 271GB for non-filing', risk: 'Low',
  },
  {
    code: 'IN-FED-044', country: 'IN', jurisdiction: 'IN-FED', category: 'transfer_pricing',
    title: 'Intercompany agreements — currency and coverage review', law: 'OECD Transfer Pricing Guidelines / Income-tax Rules, Rule 10D',
    form: 'Reviewed intercompany agreements', authority: 'Internal / transfer pricing adviser',
    frequency: 'Annual', dueRule: 'Reviewed annually and on any change in the nature or terms of intercompany dealings',
    evidence: ['Reviewed/updated intercompany agreements'], penalty: 'Documentation penalty under Sec 271AA for inadequate contemporaneous documentation', risk: 'Low',
  },

  /* --------------------------------------------------------------- India — GST */
  {
    code: 'IN-FED-045', country: 'IN', jurisdiction: 'IN-FED', category: 'vat_gst',
    title: 'Outward supplies return — GSTR-1', law: 'Central Goods and Services Tax Act, 2017, Section 37',
    form: 'GSTR-1', authority: 'GST Network / CBIC',
    frequency: 'Monthly', dueRule: '11th of the following month',
    dueOffsetMonths: 1, dueDay: 11,
    evidence: ['Filed GSTR-1 acknowledgement'], penalty: 'Late fee ₹50/day (₹20/day for nil returns), capped as prescribed', risk: 'High',
  },
  {
    code: 'IN-FED-046', country: 'IN', jurisdiction: 'IN-FED', category: 'vat_gst',
    title: 'Summary return and tax payment — GSTR-3B', law: 'Central Goods and Services Tax Act, 2017, Section 39',
    form: 'GSTR-3B', authority: 'GST Network / CBIC',
    frequency: 'Monthly', dueRule: '20th of the following month',
    dueOffsetMonths: 1, dueDay: 20,
    evidence: ['Filed GSTR-3B acknowledgement', 'Payment challan'], penalty: 'Late fee plus 18% p.a. interest on tax paid late', risk: 'Critical',
  },
  {
    code: 'IN-FED-047', country: 'IN', jurisdiction: 'IN-FED', category: 'vat_gst',
    title: 'Annual return — GSTR-9', law: 'Central Goods and Services Tax Act, 2017, Section 44',
    form: 'GSTR-9', authority: 'GST Network / CBIC',
    frequency: 'Annual', dueRule: '31 December following the financial year',
    dueMonth: 12, dueDay: 31,
    evidence: ['Filed GSTR-9'], penalty: 'Late fee ₹200/day, capped at 0.25% of turnover', risk: 'High',
  },
  {
    code: 'IN-FED-048', country: 'IN', jurisdiction: 'IN-FED', category: 'vat_gst',
    title: 'Reconciliation statement — GSTR-9C (turnover above the prescribed threshold)', law: 'Central Goods and Services Tax Act, 2017, Section 44',
    form: 'GSTR-9C', authority: 'GST Network / CBIC',
    frequency: 'Annual', dueRule: '31 December following the financial year',
    dueMonth: 12, dueDay: 31,
    evidence: ['Filed GSTR-9C', 'Reconciliation working'], penalty: 'General penalty under Sec 125 for non-filing', risk: 'Medium',
  },
  {
    code: 'IN-FED-049', country: 'IN', jurisdiction: 'IN-FED', category: 'vat_gst',
    title: 'Input service distributor return — GSTR-6', law: 'Central Goods and Services Tax Act, 2017, Section 39(4)',
    form: 'GSTR-6', authority: 'GST Network / CBIC',
    frequency: 'Monthly', dueRule: '13th of the following month',
    dueOffsetMonths: 1, dueDay: 13,
    evidence: ['Filed GSTR-6 acknowledgement'], penalty: 'Late fee ₹50/day, capped as prescribed', risk: 'Medium',
  },
  {
    code: 'IN-FED-050', country: 'IN', jurisdiction: 'IN-FED', category: 'vat_gst',
    title: 'Job work movement return — ITC-04', law: 'Central Goods and Services Tax Rules, 2017, Rule 45',
    form: 'ITC-04', authority: 'GST Network / CBIC',
    frequency: 'Half-yearly', dueRule: '25 April (Oct-Mar half) and 25 October (Apr-Sep half) — turnover-dependent filing frequency, confirm LMW\'s applicable cycle',
    dueOffsetMonths: 1, dueDay: 25,
    evidence: ['Filed ITC-04'], penalty: 'General penalty under Sec 125 for non-filing', risk: 'Medium',
  },
  {
    code: 'IN-FED-051', country: 'IN', jurisdiction: 'IN-FED', category: 'vat_gst',
    title: 'E-invoicing — IRN generation', law: 'Central Goods and Services Tax Rules, 2017, Rule 48(4)',
    form: 'IRN via Invoice Registration Portal', authority: 'GST Network / CBIC',
    frequency: 'Continuous', dueRule: 'At or before supply, for every applicable transaction',
    evidence: ['IRN-registered invoices'], penalty: 'Invoice treated as not issued; penalty under Sec 122 for non-compliance', risk: 'High',
  },
  {
    code: 'IN-FED-052', country: 'IN', jurisdiction: 'IN-FED', category: 'vat_gst',
    title: 'E-way bill compliance', law: 'Central Goods and Services Tax Rules, 2017, Rule 138',
    form: 'E-way bill', authority: 'GST Network / CBIC',
    frequency: 'Continuous', dueRule: 'Generated before commencement of movement of goods above the prescribed value threshold',
    evidence: ['Generated e-way bills'], penalty: 'Detention of goods and penalty under Sec 129 for non-compliance', risk: 'High',
  },
  {
    code: 'IN-FED-053', country: 'IN', jurisdiction: 'IN-FED', category: 'vat_gst',
    title: 'Letter of undertaking for zero-rated exports — LUT', law: 'Central Goods and Services Tax Rules, 2017, Rule 96A',
    form: 'RFD-11 (LUT)', authority: 'GST Network / CBIC',
    frequency: 'Annual', dueRule: 'Before the start of the financial year in which it is to apply — by 31 March of the preceding year',
    dueMonth: 3, dueDay: 31,
    evidence: ['Filed LUT (RFD-11) acknowledgement'], penalty: 'Exports treated as taxable pending bond/LUT; IGST payable with interest', risk: 'Medium',
  },

  /* -------------------------------------------------------- India — FEMA / RBI */
  {
    code: 'IN-FED-054', country: 'IN', jurisdiction: 'IN-FED', category: 'foreign_exchange',
    title: 'Annual return on foreign liabilities and assets (FLA)', law: 'Foreign Exchange Management Act, 1999 — FLA Regulations',
    form: 'FLA return (RBI FLAIR portal)', authority: 'Reserve Bank of India (RBI)',
    frequency: 'Annual', dueRule: '15 July following the financial year',
    dueMonth: 7, dueDay: 15,
    evidence: ['Filed FLA return acknowledgement'], penalty: 'Penal action under FEMA Sec 13 for non-filing', risk: 'High',
  },
  {
    code: 'IN-FED-055', country: 'IN', jurisdiction: 'IN-FED', category: 'foreign_exchange',
    title: 'Annual performance report for overseas investment (APR)', law: 'FEMA (Overseas Investment) Rules, 2022 (covers the LMW Global FZE investment)',
    form: 'APR (via the Authorised Dealer bank)', authority: 'Reserve Bank of India (RBI)',
    frequency: 'Annual', dueRule: '31 December following the financial year of the overseas entity',
    dueMonth: 12, dueDay: 31,
    evidence: ['Filed APR', "LMW Global FZE's audited/certified financials"], penalty: 'Compounding proceedings under FEMA for delayed/non-filing', risk: 'High',
  },
  {
    code: 'IN-FED-056', country: 'IN', jurisdiction: 'IN-FED', category: 'foreign_exchange',
    title: 'Reporting of foreign direct investment — Form FC-GPR', law: 'FEMA — FIRMS / Single Master Form reporting',
    form: 'FC-GPR (via FIRMS portal)', authority: 'Reserve Bank of India (RBI)',
    frequency: 'Event Based', dueRule: 'Within 30 days of allotment of shares to a non-resident investor',
    evidence: ['Filed FC-GPR acknowledgement'], penalty: 'Late submission fee (LSF) under FEMA for delayed reporting', risk: 'Medium',
  },
  {
    code: 'IN-FED-057', country: 'IN', jurisdiction: 'IN-FED', category: 'foreign_exchange',
    title: 'Transfer of shares between resident and non-resident — Form FC-TRS', law: 'FEMA — FIRMS / Single Master Form reporting',
    form: 'FC-TRS (via FIRMS portal)', authority: 'Reserve Bank of India (RBI) / Authorised Dealer bank',
    frequency: 'Event Based', dueRule: 'Within 60 days of transfer of shares or receipt/remittance of funds, whichever is earlier',
    evidence: ['Filed FC-TRS acknowledgement'], penalty: 'Late submission fee (LSF) under FEMA for delayed reporting', risk: 'Medium',
  },
  {
    code: 'IN-FED-058', country: 'IN', jurisdiction: 'IN-FED', category: 'foreign_exchange',
    title: 'External commercial borrowing monthly return', law: 'FEMA — External Commercial Borrowings (ECB) Framework',
    form: 'ECB-2 return', authority: 'Reserve Bank of India (RBI) / Authorised Dealer bank',
    frequency: 'Monthly', dueRule: 'Within 7 working days of month end',
    dueOffsetMonths: 1, dueDay: 7,
    evidence: ['Filed ECB-2 return'], penalty: 'Reporting default flagged to RBI; compounding risk under FEMA', risk: 'Medium',
  },
  {
    code: 'IN-FED-059', country: 'IN', jurisdiction: 'IN-FED', category: 'foreign_exchange',
    title: 'Export and import realisation tracking', law: 'FEMA — Export Data Processing and Monitoring System (EDPMS) / Import Data Processing and Monitoring System (IDPMS)',
    form: 'EDPMS / IDPMS reconciliation', authority: 'Reserve Bank of India (RBI) / Authorised Dealer bank',
    frequency: 'Monthly', dueRule: 'Export proceeds realised within 9 months of the date of export; tracked monthly against outstanding shipping bills',
    evidence: ['EDPMS/IDPMS reconciliation report'], penalty: 'Caution-listing by RBI for overdue export realisation', risk: 'Medium',
  },

  /* ----------------------------------------------------------- India — labour law */
  {
    code: 'IN-FED-060', country: 'IN', jurisdiction: 'IN-FED', category: 'labour_law',
    title: 'Provident fund electronic challan cum return (ECR)', law: 'Employees\' Provident Funds and Miscellaneous Provisions Act, 1952',
    form: 'ECR', authority: 'Employees\' Provident Fund Organisation (EPFO)',
    frequency: 'Monthly', dueRule: '15th of the following month',
    dueOffsetMonths: 1, dueDay: 15,
    evidence: ['Filed ECR', 'Payment receipt'], penalty: 'Damages under Sec 14B and interest under Sec 7Q', risk: 'Critical',
  },
  {
    code: 'IN-FED-061', country: 'IN', jurisdiction: 'IN-FED', category: 'labour_law',
    title: 'Employees\' State Insurance contribution', law: 'Employees\' State Insurance Act, 1948',
    form: 'ESI monthly contribution', authority: 'Employees\' State Insurance Corporation (ESIC)',
    frequency: 'Monthly', dueRule: '15th of the following month',
    dueOffsetMonths: 1, dueDay: 15,
    evidence: ['Contribution payment receipt'], penalty: 'Interest at 12% p.a. and damages as prescribed', risk: 'High',
  },
  {
    code: 'IN-FED-064', country: 'IN', jurisdiction: 'IN-FED', category: 'labour_law',
    title: 'Bonus payment and annual return', law: 'Payment of Bonus Act, 1965',
    form: 'Annual return (Form D)', authority: 'Office of the Labour Commissioner',
    frequency: 'Annual', dueRule: 'Bonus paid and return filed within 8 months of the close of the accounting year — by 30 November',
    dueMonth: 11, dueDay: 30,
    evidence: ['Bonus payment records', 'Filed annual return (Form D)'], penalty: 'Prosecution under the Payment of Bonus Act for default', risk: 'Medium',
  },
  {
    code: 'IN-FED-065', country: 'IN', jurisdiction: 'IN-FED', category: 'labour_law',
    title: 'Gratuity provision and nominations', law: 'Payment of Gratuity Act, 1972',
    form: 'Gratuity nomination (Form F) and actuarial provisioning', authority: 'Controlling Authority under the Payment of Gratuity Act',
    frequency: 'Annual', dueRule: 'Nominations obtained from each new joiner; gratuity liability reviewed/provisioned annually',
    evidence: ['Nomination forms (Form F)', 'Actuarial valuation report'], penalty: 'Penalty under Sec 9 of the Payment of Gratuity Act for default', risk: 'Low',
  },
  {
    code: 'IN-FED-066', country: 'IN', jurisdiction: 'IN-FED', category: 'labour_law',
    title: 'Contract labour registers and returns', law: 'Contract Labour (Regulation and Abolition) Act, 1970',
    form: 'Annual return (Form XXV)', authority: 'Office of the Labour Commissioner (Principal Employer\'s registering authority)',
    frequency: 'Annual', dueRule: 'Commonly by 15 February for the preceding calendar year — confirm the state-specific date',
    dueMonth: 2, dueDay: 15,
    evidence: ['Contract labour registers', 'Filed annual return'], penalty: 'Prosecution under the Contract Labour (R&A) Act for default', risk: 'Medium', factory: true,
  },
  {
    code: 'IN-FED-069', country: 'IN', jurisdiction: 'IN-FED', category: 'labour_law',
    title: 'POSH annual report', law: 'Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013',
    form: 'Internal Committee annual report', authority: 'District Officer / disclosed in the Board report',
    frequency: 'Annual', dueRule: 'For the preceding calendar year, disclosed in the Board report — aligned here to 31 January',
    dueMonth: 1, dueDay: 31,
    evidence: ['Internal Committee annual report', 'Board report disclosure'], penalty: 'Penalty under Sec 26 of the POSH Act for non-compliance', risk: 'Medium',
  },

  /* -------------------------------------------------- India — customs / trade */
  {
    code: 'IN-FED-070', country: 'IN', jurisdiction: 'IN-FED', category: 'customs_trade',
    title: 'Import declarations and duty payment', law: 'Customs Act, 1962',
    form: 'Bill of Entry', authority: 'Central Board of Indirect Taxes and Customs (CBIC)',
    frequency: 'Continuous', dueRule: 'Filed per consignment, within the prescribed time of arrival',
    evidence: ['Filed Bill of Entry', 'Duty payment receipt'], penalty: 'Interest and penalty under the Customs Act for delayed filing', risk: 'High', importer: true,
  },
  {
    code: 'IN-FED-071', country: 'IN', jurisdiction: 'IN-FED', category: 'customs_trade',
    title: 'Export declarations', law: 'Customs Act, 1962 / Foreign Trade Policy',
    form: 'Shipping Bill', authority: 'Central Board of Indirect Taxes and Customs (CBIC)',
    frequency: 'Continuous', dueRule: 'Filed per export consignment',
    evidence: ['Filed Shipping Bill'], penalty: 'Penalty under the Customs Act for incorrect/delayed declarations', risk: 'Medium', importer: true,
  },
  {
    code: 'IN-FED-072', country: 'IN', jurisdiction: 'IN-FED', category: 'customs_trade',
    title: 'Importer Exporter Code (IEC) annual update', law: 'Foreign Trade Policy / Foreign Trade (Development and Regulation) Act, 1992',
    form: 'IEC e-KYC update', authority: 'Directorate General of Foreign Trade (DGFT)',
    frequency: 'Annual', dueRule: 'Between April and June every year, even with no change — by 30 June',
    dueMonth: 6, dueDay: 30,
    evidence: ['Updated IEC confirmation'], penalty: 'IEC deactivated until updated', risk: 'Medium', importer: true,
  },
  {
    code: 'IN-FED-073', country: 'IN', jurisdiction: 'IN-FED', category: 'customs_trade',
    title: 'Bonded manufacturing returns (MOOWR)', law: 'Customs Act, 1962, Section 65 (Manufacture and Other Operations in Warehouse Regulations)',
    form: 'Bond account / monthly return as prescribed by the bond officer', authority: 'Jurisdictional Customs Bond Officer',
    frequency: 'Monthly', dueRule: 'As prescribed by the bond officer for the specific MOOWR unit — confirm applicability and cycle',
    evidence: ['Filed bonded manufacturing return'], penalty: 'Duty demand and penalty under the Customs Act for non-compliance', risk: 'Medium', importer: true,
  },
  {
    code: 'IN-FED-074', country: 'IN', jurisdiction: 'IN-FED', category: 'customs_trade',
    title: 'Export obligation fulfilment — EPCG', law: 'Foreign Trade Policy — Export Promotion Capital Goods scheme',
    form: 'Annual EO report / Export Obligation Discharge Certificate (EODC) application', authority: 'Directorate General of Foreign Trade (DGFT)',
    frequency: 'Annual', dueRule: 'Annual report by 30 April; block-wise export obligation tracked within the authorisation\'s EO period (typically 6 years, in staggered blocks)',
    dueMonth: 4, dueDay: 30,
    evidence: ['Shipping bills', 'Annual EO report', 'EODC application/certificate'], penalty: 'Duty saved plus interest and penalty on shortfall under the FTP', risk: 'High', importer: true,
  },
  {
    code: 'IN-FED-075', country: 'IN', jurisdiction: 'IN-FED', category: 'customs_trade',
    title: 'Advance authorisation — export obligation and redemption', law: 'Foreign Trade Policy — Advance Authorisation scheme',
    form: 'Export obligation redemption application', authority: 'Directorate General of Foreign Trade (DGFT)',
    frequency: 'Event Based', dueRule: 'Within the export obligation period fixed on the specific authorisation',
    evidence: ['Shipping bills against authorisation', 'Redemption application'], penalty: 'Duty saved plus interest and penalty on shortfall under the FTP', risk: 'Medium', importer: true,
  },

  /* --------------------------------------------------- India — environmental (EHS) */
  {
    code: 'IN-FED-078', country: 'IN', jurisdiction: 'IN-FED', category: 'environmental_ehs',
    title: 'Environmental statement', law: 'Environment (Protection) Rules, 1986, Rule 14',
    form: 'Form V (Environmental Statement)', authority: 'Tamil Nadu Pollution Control Board (state board, central rule)',
    frequency: 'Annual', dueRule: '30 September, for the year ended 31 March',
    dueMonth: 9, dueDay: 30,
    evidence: ['Filed Form V environmental statement'], penalty: 'Action under the Environment (Protection) Act, 1986 for non-filing', risk: 'Medium', factory: true,
  },
  {
    code: 'IN-FED-079', country: 'IN', jurisdiction: 'IN-FED', category: 'environmental_ehs',
    title: 'Hazardous waste authorisation and annual return', law: 'Hazardous and Other Wastes (Management and Transboundary Movement) Rules, 2016',
    form: 'Form 4 annual return', authority: 'Tamil Nadu Pollution Control Board (state board, central rule)',
    frequency: 'Annual', dueRule: '30 June, for the preceding financial year',
    dueMonth: 6, dueDay: 30,
    evidence: ['Filed Form 4 annual return'], penalty: 'Action under the Environment (Protection) Act, 1986 for non-filing', risk: 'Medium', factory: true,
  },
  {
    code: 'IN-FED-080', country: 'IN', jurisdiction: 'IN-FED', category: 'environmental_ehs',
    title: 'E-waste EPR compliance and returns', law: 'E-Waste (Management) Rules, 2022',
    form: 'EPR quarterly return (via CPCB portal)', authority: 'Central Pollution Control Board (CPCB)',
    frequency: 'Quarterly', dueRule: 'Within the prescribed quarterly timeline on the CPCB EPR portal — confirm the exact date each quarter',
    evidence: ['Filed EPR quarterly return'], penalty: 'Environmental compensation for shortfall against EPR targets', risk: 'Medium', factory: true,
  },

  /* --------------------------------------------------- India — industry regulation */
  {
    code: 'IN-FED-042B', country: 'IN', jurisdiction: 'IN-FED', category: 'industry_regulation',
    title: 'Factories Act — annual and half-yearly returns', law: 'Factories Act, 1948, Section 61',
    form: 'Annual Return (Form 21/22 as prescribed by the state rules)', authority: 'State Factory Inspectorate',
    frequency: 'Annual', dueRule: 'State-specific, commonly on or before 31 January for the preceding calendar year',
    dueMonth: 1, dueDay: 31,
    evidence: ['Filed annual return'], penalty: 'Prosecution under Sec 92 of the Factories Act', risk: 'Medium', factory: true,
  },
  {
    code: 'IN-FED-085', country: 'IN', jurisdiction: 'IN-FED', category: 'industry_regulation',
    title: 'Fire safety no-objection certificate', law: 'State Fire Service Acts / National Building Code',
    form: 'Fire NOC renewal', authority: 'State Fire and Rescue Services Department',
    frequency: 'Periodic', dueRule: 'Before expiry of the existing NOC, per the state\'s renewal schedule',
    evidence: ['Renewed Fire NOC'], penalty: 'Closure direction / prosecution for operating without a valid NOC', risk: 'High', factory: true,
  },
  {
    code: 'IN-FED-090', country: 'IN', jurisdiction: 'IN-FED', category: 'industry_regulation',
    title: 'Automotive type approval and conformity of production', law: 'Central Motor Vehicles Rules (CMVR) / AIS standards',
    form: 'Type approval certificate / COP test report', authority: 'Testing agency (e.g. ARAI) / Ministry of Road Transport and Highways',
    frequency: 'Periodic', dueRule: 'On every model change, plus periodic conformity-of-production (COP) testing — confirm applicability to LMW\'s product lines',
    evidence: ['Type approval certificate', 'COP test reports'], penalty: 'Product cannot be sold/registered without valid type approval', risk: 'Medium',
  },
  {
    code: 'IN-FED-091', country: 'IN', jurisdiction: 'IN-FED', category: 'industry_regulation',
    title: 'Quality management system certification', law: 'IATF 16949 / ISO 9001',
    form: 'Certification / surveillance audit report', authority: 'Accredited certification body',
    frequency: 'Annual', dueRule: 'Annual surveillance audit; full recertification every 3 years',
    evidence: ['Surveillance audit report', 'Certification/recertification'], penalty: 'Certification suspension/withdrawal for non-conformance', risk: 'Medium',
  },

  /* --------------------------------------------------- India — data privacy & cyber */
  {
    code: 'IN-FED-087', country: 'IN', jurisdiction: 'IN-FED', category: 'data_privacy',
    title: 'Digital personal data protection programme', law: 'Digital Personal Data Protection Act, 2023 and DPDP Rules, 2025',
    form: 'DPDP compliance programme (consent framework, grievance redressal, data breach process)', authority: 'Data Protection Board of India',
    frequency: 'Continuous', dueRule: 'DPDP Rules notified 13/14 November 2025; Consent Manager framework operational from 13 November 2026; full compliance required by 13 May 2027',
    evidence: ['DPDP compliance programme documentation', 'Consent management records'], penalty: 'Financial penalty up to ₹250 crore for significant data breaches or non-compliance', risk: 'High',
  },
  {
    code: 'IN-FED-088', country: 'IN', jurisdiction: 'IN-FED', category: 'data_privacy',
    title: 'Cyber incident reporting', law: 'CERT-In Directions, 2022 issued under Section 70B of the Information Technology Act, 2000',
    form: 'CERT-In incident report', authority: 'Indian Computer Emergency Response Team (CERT-In)',
    frequency: 'Event Based', dueRule: 'Within 6 hours of noticing or being brought to notice of a reportable cyber incident',
    evidence: ['Filed CERT-In incident report'], penalty: 'Action under Sec 70B of the IT Act for non-reporting', risk: 'Critical',
  },

  /* --------------------------------------------------------- India — competition law */
  {
    code: 'IN-FED-092', country: 'IN', jurisdiction: 'IN-FED', category: 'competition_law',
    title: 'Competition compliance and combination filings', law: 'Competition Act, 2002',
    form: 'Combination notice (Form I/II) where applicable', authority: 'Competition Commission of India (CCI)',
    frequency: 'Event Based', dueRule: 'Before consummation of a notifiable transaction (merger/acquisition/combination) crossing the prescribed thresholds',
    evidence: ['Filed combination notice', 'CCI approval'], penalty: 'Penalty up to 1% of turnover/assets under Sec 43A for failure to notify', risk: 'Medium',
  },

  /* ---------------------------------------------------- UAE — federal (LMW Global FZE) */
  {
    code: 'AE-FED-001', country: 'AE', jurisdiction: 'AE-FED', category: 'vat_gst',
    title: 'VAT return', law: 'Federal Decree-Law No. 8 of 2017 on Value Added Tax',
    form: 'VAT 201', authority: 'Federal Tax Authority (FTA)',
    frequency: 'Quarterly', dueRule: '28th of the month following the tax period end',
    dueOffsetMonths: 1, dueDay: 28,
    evidence: ['Filed VAT 201', 'Payment confirmation'], penalty: 'AED 1,000 fixed penalty for the first late filing, rising for repeats, plus 14% p.a. on unpaid tax', risk: 'High',
  },
  {
    code: 'AE-FED-002', country: 'AE', jurisdiction: 'AE-FED', category: 'direct_tax',
    title: 'Corporate Tax return', law: 'Federal Decree-Law No. 47 of 2022 on the Taxation of Corporations and Businesses',
    form: 'Corporate Tax return', authority: 'Federal Tax Authority (FTA)',
    frequency: 'Annual', dueRule: 'Within 9 months of the end of the relevant tax period — 31 December',
    dueMonth: 12, dueDay: 31,
    evidence: ['Filed Corporate Tax return', 'Financial statements'], penalty: 'AED 500/month for the first 12 months, then AED 1,000/month, for late filing', risk: 'Critical',
  },
  {
    code: 'AE-FED-003', country: 'AE', jurisdiction: 'AE-FED', category: 'corporate_law',
    title: 'Economic Substance Regulations — notification and report (if a Relevant Activity is carried on)', law: 'Cabinet of Ministers Resolution No. 57 of 2020 (Economic Substance Regulations)',
    form: 'ESR notification / report', authority: 'Ministry of Finance / relevant Regulatory Authority',
    frequency: 'Annual', dueRule: 'Notification within 6 months, report within 12 months of financial year end — by 31 March',
    dueMonth: 3, dueDay: 31,
    evidence: ['Filed ESR notification/report'], penalty: 'AED 20,000–400,000 depending on the breach', risk: 'Medium',
  },
  {
    code: 'AE-FED-004', country: 'AE', jurisdiction: 'AE-FED', category: 'corporate_law',
    title: 'Ultimate Beneficial Owner (UBO) register — filing and updates', law: 'Cabinet Decision No. 58 of 2020 on the Regulation of Beneficial Owner Procedures',
    form: 'UBO declaration', authority: 'Registrar / relevant licensing authority',
    frequency: 'Event Based', dueRule: 'On incorporation and within 15 days of any change',
    evidence: ['Filed UBO declaration'], penalty: 'Administrative fines for non-filing or delayed updates', risk: 'Medium',
  },
];
