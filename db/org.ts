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

/* LMW's own business divisions. LMW Limited is one legal entity organised
   into these operating divisions; CORP covers group/holding-level obligations
   that are not specific to a single division. */
export const DIVISIONS: { id: string; name: string }[] = [
  { id: 'CORP', name: 'Corporate / Group' },
  { id: 'TMD', name: 'Textile Machinery Division' },
  { id: 'MTD', name: 'Machine Tool Division' },
  { id: 'FOUNDRY', name: 'Foundry Division' },
  { id: 'ATC', name: 'Advanced Technology Centre' },
];

/* Two legal entities confirmed from LMW's public group structure:
   the listed Indian parent (Coimbatore) and its UAE free-zone subsidiary.
   Everything else about the group (additional plants/states, employee counts,
   auditor and adviser names) is left as "to be confirmed" rather than guessed —
   add/correct entities here or in Administration -> Entities once real figures
   are available. */
export const ENTITIES: EntitySeed[] = [
  {
    id: 'LMW-IN', name: 'LMW Limited', short: 'LMW', country: 'IN',
    jurisdiction: 'IN-FED', alsoIn: ['IN-TN'], division: 'CORP',
    type: 'Listed parent company — manufacturing (Textile Machinery, Machine Tools, Foundry, Advanced Technology Centre)',
    city: 'Coimbatore, Tamil Nadu, India', currency: 'INR', fyEnd: '31 March',
    employees: 0, listed: true, factory: true, importer: true,
    auditor: 'Statutory auditor — to be confirmed', advisor: 'Local tax / company-secretarial adviser — to be confirmed',
  },
  {
    id: 'LMW-FZE-AE', name: 'LMW Global FZE', short: 'LMW Global FZE', country: 'AE',
    jurisdiction: 'AE-FZ', division: 'CORP', parent: 'LMW-IN',
    type: 'Wholly-owned subsidiary — UAE free zone establishment (marketing / distribution support)',
    city: 'Dubai, United Arab Emirates', currency: 'AED', fyEnd: '31 March',
    employees: 0, listed: false, factory: false, importer: true,
    auditor: 'Statutory auditor — to be confirmed', advisor: 'Local UAE adviser — to be confirmed',
  },
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

  { id: 'AUDITOR', name: 'Auditor', system: true,
    description: 'Read-only access to compliances, evidence and the audit trail. Cannot approve, '
      + 'reject or file, but can leave a comment on any submission for the record.',
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

/* Placeholder roster requested for go-live demo: Administrator, Preparer,
   Reviewer and CFO, all on the lmw.example domain and the shared SEED_PASSWORD.
   Rename these to real people's actual email addresses in Administration ->
   Users (or here, then re-run db:setup) before this carries real filings. */
export const USERS: UserSeed[] = [
  { email: 'admin@lmw.example', name: 'Platform Administrator', role: 'ADMIN', entities: ['*'] },
  { email: 'preparer@lmw.example', name: 'Preparer — LMW Limited', role: 'PREPARER', entities: ['LMW-IN'], file: true },
  { email: 'reviewer@lmw.example', name: 'Reviewer', role: 'REVIEWER', entities: ['*'], review: true },
  { email: 'cfo@lmw.example', name: 'Group CFO', role: 'CFO', entities: ['*'] },
  { email: 'auditor@lmw.example', name: 'Auditor', role: 'AUDITOR', entities: ['*'] },
];
