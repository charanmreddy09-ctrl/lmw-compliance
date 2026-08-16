/* ===========================================================================
   ORGANISATION SEED
   ---------------------------------------------------------------------------
   Initial master data only. Everything here is editable inside the application
   (Administration -> Entities / Users) and is stored in database tables, not
   in code. This file exists purely to populate a fresh database on first run.
   =========================================================================== */

export type EntitySeed = {
  id: string;
  name: string;
  short: string;
  country: string;
  jurisdiction: string;          // primary registered jurisdiction
  alsoIn?: string[];             // additional states/provinces of operation
  division: string;
  parent?: string;
  type: string;
  city: string;
  currency: string;
  fyEnd: string;
  employees: number;
  listed?: boolean;
  factory?: boolean;
  importer?: boolean;
  auditor: string;
  advisor: string;
};

export const DIVISIONS = [
  { id: 'DCD', name: 'Domestic Cable Division' },
  { id: 'SCD', name: 'Suprajit Controls Division' },
  { id: 'PLD', name: 'Phoenix Lamps Division' },
  { id: 'SED', name: 'Suprajit Electronics Division' },
  { id: 'TC',  name: 'Technology Centre' },
  { id: 'OVS', name: 'Overseas Operations' },
  { id: 'HLD', name: 'Holding & Treasury' },
];

export const ENTITIES: EntitySeed[] = [
  { id: 'E-IN-HQ', name: 'Suprajit Engineering Limited', short: 'Group HQ', country: 'IN',
    jurisdiction: 'IN-KA', division: 'DCD', type: 'Listed parent', city: 'Bengaluru, Karnataka',
    currency: 'INR', fyEnd: '31 March', employees: 2400, listed: true, factory: true, importer: true,
    auditor: 'Statutory auditor — to be confirmed', advisor: 'Group tax adviser, India' },

  { id: 'E-IN-SCD', name: 'Suprajit Controls Division', short: 'Controls Division', country: 'IN',
    jurisdiction: 'IN-KA', division: 'SCD', parent: 'E-IN-HQ', type: 'Division', city: 'Bengaluru, Karnataka',
    currency: 'INR', fyEnd: '31 March', employees: 860, factory: true, importer: true,
    auditor: 'Statutory auditor — to be confirmed', advisor: 'Group tax adviser, India' },

  { id: 'E-IN-PLD', name: 'Phoenix Lamps Division', short: 'Phoenix Lamps', country: 'IN',
    jurisdiction: 'IN-UP', division: 'PLD', parent: 'E-IN-HQ', type: 'Division', city: 'Noida, Uttar Pradesh',
    currency: 'INR', fyEnd: '31 March', employees: 1150, factory: true, importer: true,
    auditor: 'Statutory auditor — to be confirmed', advisor: 'Regional tax adviser, Delhi NCR' },

  { id: 'E-IN-SED', name: 'Suprajit Electronics Division', short: 'Electronics Division', country: 'IN',
    jurisdiction: 'IN-KA', division: 'SED', parent: 'E-IN-HQ', type: 'Division', city: 'Bengaluru, Karnataka',
    currency: 'INR', fyEnd: '31 March', employees: 390, factory: true, importer: true,
    auditor: 'Statutory auditor — to be confirmed', advisor: 'Group tax adviser, India' },

  { id: 'E-IN-TC', name: 'Suprajit Technology Centre', short: 'Technology Centre', country: 'IN',
    jurisdiction: 'IN-KA', division: 'TC', parent: 'E-IN-HQ', type: 'R&D centre', city: 'Bengaluru, Karnataka',
    currency: 'INR', fyEnd: '31 March', employees: 210,
    auditor: 'Statutory auditor — to be confirmed', advisor: 'Group tax adviser, India' },

  { id: 'E-US-01', name: 'Suprajit North America Inc.', short: 'North America', country: 'US',
    jurisdiction: 'US-MI', alsoIn: ['US-DE', 'US-OH', 'US-TX', 'US-CA'], division: 'OVS', parent: 'E-IN-HQ',
    type: 'Operating subsidiary', city: 'Michigan, USA', currency: 'USD', fyEnd: '31 December',
    employees: 280, factory: true, importer: true,
    auditor: 'US member firm', advisor: 'US tax counsel' },

  { id: 'E-MX-01', name: 'Suprajit Mexico S.A. de C.V.', short: 'Mexico', country: 'MX',
    jurisdiction: 'MX-QRO', division: 'OVS', parent: 'E-IN-HQ', type: 'IMMEX manufacturer',
    city: 'Querétaro, Mexico', currency: 'MXN', fyEnd: '31 December', employees: 640,
    factory: true, importer: true, auditor: 'Mexican member firm', advisor: 'Local customs and tax counsel' },

  { id: 'E-UK-01', name: 'Suprajit Europe Limited', short: 'Europe (UK)', country: 'UK',
    jurisdiction: 'UK-FED', division: 'OVS', parent: 'E-IN-HQ', type: 'Operating subsidiary',
    city: 'Coventry, United Kingdom', currency: 'GBP', fyEnd: '31 March', employees: 190,
    factory: true, importer: true, auditor: 'UK member firm', advisor: 'UK tax advisers' },

  { id: 'E-DE-01', name: 'Suprajit Automotive GmbH', short: 'Germany', country: 'DE',
    jurisdiction: 'DE-BW', division: 'OVS', parent: 'E-IN-HQ', type: 'Operating subsidiary',
    city: 'Baden-Württemberg, Germany', currency: 'EUR', fyEnd: '31 December', employees: 230,
    factory: true, importer: true, auditor: 'German member firm', advisor: 'Steuerberater' },

  { id: 'E-HU-01', name: 'Suprajit Hungary Kft.', short: 'Hungary', country: 'HU',
    jurisdiction: 'HU-FED', division: 'OVS', parent: 'E-IN-HQ', type: 'Operating subsidiary',
    city: 'Győr, Hungary', currency: 'HUF', fyEnd: '31 December', employees: 170,
    factory: true, importer: true, auditor: 'Hungarian member firm', advisor: 'Local tax adviser' },

  { id: 'E-CN-01', name: 'Suprajit (Shanghai) Co. Ltd.', short: 'Shanghai', country: 'CN',
    jurisdiction: 'CN-FED', division: 'OVS', parent: 'E-IN-HQ', type: 'WFOE manufacturer',
    city: 'Shanghai, PRC', currency: 'CNY', fyEnd: '31 December', employees: 410,
    factory: true, importer: true, auditor: 'PRC member firm', advisor: 'PRC tax and customs counsel' },

  { id: 'E-LU-01', name: 'Suprajit Luxembourg S.à r.l.', short: 'Luxembourg', country: 'LU',
    jurisdiction: 'LU-FED', division: 'HLD', parent: 'E-IN-HQ', type: 'Holding company',
    city: 'Luxembourg City', currency: 'EUR', fyEnd: '31 December', employees: 4,
    auditor: 'Luxembourg réviseur d’entreprises', advisor: 'Luxembourg tax counsel' },

  { id: 'E-MA-01', name: 'Suprajit Morocco SARL', short: 'Morocco', country: 'MA',
    jurisdiction: 'MA-FED', division: 'OVS', parent: 'E-IN-HQ', type: 'Industrial zone manufacturer',
    city: 'Tanger, Morocco', currency: 'MAD', fyEnd: '31 December', employees: 310,
    factory: true, importer: true, auditor: 'Moroccan member firm', advisor: 'Local tax and customs counsel' },

  { id: 'E-CA-01', name: 'Suprajit Canada Inc.', short: 'Canada', country: 'CA',
    jurisdiction: 'CA-ON', alsoIn: ['CA-QC'], division: 'OVS', parent: 'E-IN-HQ',
    type: 'Distribution subsidiary', city: 'Ontario, Canada', currency: 'CAD', fyEnd: '31 December',
    employees: 56, importer: true, auditor: 'Canadian member firm', advisor: 'Canadian tax advisers' },
];

/* ---------------------------------------------------------------- roles
   Permission strings are checked server side on every mutating request.
   compliance.file    — upload a compliance with evidence
   compliance.review  — approve / reject / query
   compliance.library — create, edit, delete, import library records
   compliance.verify  — sign off a newly added compliance only (cannot edit,
                         delete, import, or un-verify an already-verified one)
   duedate.manage     — decide pending due-date sync proposals, import due-date files
   delegation.manage  — delegate review authority (CFO)
   users.manage       — create, approve, disable users
   reports.generate   — run and export reports
   score.view.all     — see every entity's score

   The CFO deliberately does NOT hold duedate.manage: due-date sync proposals
   are an operational data-quality task, not something that should sit in the
   CFO's queue. CFO Office, the Country Head and Admin can still decide them
   without waiting on the CFO personally. */
export const ROLES = [
  { id: 'CFO', name: 'Group CFO', system: true,
    description: 'Monitors the group compliance score, delegates reviews and generates reports. Does not review individual filings.',
    permissions: ['score.view.all', 'reports.generate', 'delegation.manage', 'users.manage', 'compliance.library', 'audit.view'] },

  { id: 'CFO_OFFICE', name: 'CFO Office / Group Finance', system: true,
    description: 'Works on behalf of the CFO across all entities.',
    permissions: ['score.view.all', 'reports.generate', 'delegation.manage', 'compliance.review', 'compliance.library', 'duedate.manage', 'audit.view'] },

  { id: 'COUNTRY_HEAD', name: 'Country Head', system: true,
    description: 'Accountable for every entity in an assigned country. Final local sign-off.',
    permissions: ['score.view.country', 'reports.generate', 'compliance.review', 'duedate.manage'] },

  { id: 'REVIEWER', name: 'Reviewer', system: true,
    description: 'Reviews uploaded compliances and evidence. Can approve, reject, raise a query or reassign. Can also sign off newly added compliance items, but cannot edit the library or decide due-date changes.',
    permissions: ['compliance.review', 'compliance.verify', 'reports.generate'] },

  { id: 'PREPARER', name: 'Entity User / Preparer', system: true,
    description: 'Responsible for filing. Uploads the compliance together with its documentary evidence.',
    permissions: ['compliance.file'] },

  { id: 'ADMIN', name: 'Platform Administrator', system: true,
    description: 'Manages users, entities, jurisdictions and the compliance library.',
    permissions: ['users.manage', 'compliance.library', 'duedate.manage', 'audit.view', 'score.view.all', 'reports.generate'] },

  { id: 'AUDITOR', name: 'Auditor (read only)', system: true,
    description: 'Read-only access to compliances, evidence and the audit trail.',
    permissions: ['score.view.all', 'reports.generate', 'audit.view'] },
];

/* ---------------------------------------------------------------- users
   Seeded so the platform is usable the moment setup finishes. Every one of
   these can be disabled or deleted in Administration, and new users are
   created by email invitation from inside the application.
*/
export type UserSeed = {
  email: string;
  name: string;
  role: string;
  entities: string[];            // '*' = all entities
  file?: boolean;
  review?: boolean;
};

export const USERS: UserSeed[] = [
  { email: 'cfo@suprajit.example',            name: 'Group CFO',            role: 'CFO',          entities: ['*'] },
  { email: 'groupfinance@suprajit.example',   name: 'Group Finance Lead',   role: 'CFO_OFFICE',   entities: ['*'], review: true },
  { email: 'admin@suprajit.example',          name: 'Platform Administrator', role: 'ADMIN',      entities: ['*'] },

  { email: 'countryhead.in@suprajit.example', name: 'Country Head — India',   role: 'COUNTRY_HEAD',
    entities: ['E-IN-HQ','E-IN-SCD','E-IN-PLD','E-IN-SED','E-IN-TC'], review: true },
  { email: 'countryhead.us@suprajit.example', name: 'Country Head — Americas', role: 'COUNTRY_HEAD',
    entities: ['E-US-01','E-MX-01','E-CA-01'], review: true },
  { email: 'countryhead.eu@suprajit.example', name: 'Country Head — Europe',   role: 'COUNTRY_HEAD',
    entities: ['E-UK-01','E-DE-01','E-HU-01','E-LU-01'], review: true },
  { email: 'countryhead.apac@suprajit.example', name: 'Country Head — Asia & Africa', role: 'COUNTRY_HEAD',
    entities: ['E-CN-01','E-MA-01'], review: true },

  { email: 'reviewer.tax@suprajit.example',   name: 'Reviewer — Taxation',   role: 'REVIEWER', entities: ['*'], review: true },
  { email: 'reviewer.legal@suprajit.example', name: 'Reviewer — Legal & Secretarial', role: 'REVIEWER', entities: ['*'], review: true },
  { email: 'reviewer.hr@suprajit.example',    name: 'Reviewer — Payroll & Labour', role: 'REVIEWER', entities: ['*'], review: true },

  { email: 'user.in.hq@suprajit.example',  name: 'Preparer — Group HQ',        role: 'PREPARER', entities: ['E-IN-HQ'], file: true },
  { email: 'user.in.pld@suprajit.example', name: 'Preparer — Phoenix Lamps',   role: 'PREPARER', entities: ['E-IN-PLD'], file: true },
  { email: 'user.in.scd@suprajit.example', name: 'Preparer — Controls Division', role: 'PREPARER', entities: ['E-IN-SCD','E-IN-SED','E-IN-TC'], file: true },
  { email: 'user.us@suprajit.example',     name: 'Preparer — North America',   role: 'PREPARER', entities: ['E-US-01'], file: true },
  { email: 'user.mx@suprajit.example',     name: 'Preparer — Mexico',          role: 'PREPARER', entities: ['E-MX-01'], file: true },
  { email: 'user.uk@suprajit.example',     name: 'Preparer — Europe (UK)',     role: 'PREPARER', entities: ['E-UK-01'], file: true },
  { email: 'user.de@suprajit.example',     name: 'Preparer — Germany',         role: 'PREPARER', entities: ['E-DE-01'], file: true },
  { email: 'user.hu@suprajit.example',     name: 'Preparer — Hungary',         role: 'PREPARER', entities: ['E-HU-01'], file: true },
  { email: 'user.cn@suprajit.example',     name: 'Preparer — Shanghai',        role: 'PREPARER', entities: ['E-CN-01'], file: true },
  { email: 'user.lu@suprajit.example',     name: 'Preparer — Luxembourg',      role: 'PREPARER', entities: ['E-LU-01'], file: true },
  { email: 'user.ma@suprajit.example',     name: 'Preparer — Morocco',         role: 'PREPARER', entities: ['E-MA-01'], file: true },
  { email: 'user.ca@suprajit.example',     name: 'Preparer — Canada',          role: 'PREPARER', entities: ['E-CA-01'], file: true },

  { email: 'auditor@suprajit.example',     name: 'External Auditor',           role: 'AUDITOR',  entities: ['*'] },
];
