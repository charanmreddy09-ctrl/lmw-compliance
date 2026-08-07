/* ===========================================================================
   SCORING CONFIGURATION — Phase A, modules A1 / A2 / A3
   ---------------------------------------------------------------------------
   Every number the compliance health score depends on lives in this file and
   nowhere else. A CFO who disputes a score has to be able to be shown the
   rule that produced it, so the rules are data, not logic buried in SQL.

   Three ideas compose into one score:

     A1  OUTCOME        what happened to the obligation — filed on time, filed
                        late, still with a reviewer, overdue with nothing at
                        all — scored out of 100.

     A2  CRITICALITY    not every obligation matters equally. A missed GST
                        return is not a late professional-tax return. Each
                        obligation's points are weighted by the risk_level
                        already carried on the compliance library record.

     A3  EVIDENCE       an approval backed by a government acknowledgement is
                        worth more than one backed by a screenshot. Evidence
                        quality scales the points an obligation earns.

   Score = Σ (points × criticality) / Σ (100 × criticality) × 100

   The denominator uses the same criticality weights as the numerator, so the
   score stays a percentage of what was achievable and a portfolio of mostly
   critical obligations is not mathematically penalised for being critical.
   =========================================================================== */

/* ------------------------------------------------------------------ A1 */
/** Points out of 100 for the outcome of a single obligation. */
export const OUTCOME_POINTS = {
  /** Approved by a reviewer, filed on or before the due date. */
  approvedOnTime: 100,
  /** Approved, but the filing itself was late — the obligation is met, the
      discipline was not. */
  approvedLate: 85,
  /** Filed with evidence, sitting with a reviewer. Real work, not yet proven. */
  awaitingReview: 50,
  /** Returned to the preparer with a question. */
  queryRaised: 30,
  /** Rejected outright — worth more than nothing, because evidence exists and
      the workflow is live, but only just. */
  rejected: 20,
  /** Past the due date with no evidence at all. */
  overdueNoEvidence: 0,
  /** Due, not started, not yet overdue. */
  notStarted: 0,
} as const;

/** Point adjustments applied on top of the outcome, then clamped to 0…100. */
export const DEDUCTIONS = {
  /** This obligation was late and the same compliance was already filed late
      for this entity in an earlier period. A pattern, not an accident. */
  repeatedDelay: -10,
  /** A Critical-risk obligation past its due date. */
  criticalOverdue: -25,
  /** Past due, workflow says something happened, but no document is on file. */
  missingEvidence: -20,
} as const;

/* ------------------------------------------------------------------ A2 */
/** Criticality multiplier, keyed on compliances.risk_level. */
export const CRITICALITY_WEIGHT: Record<string, number> = {
  Critical: 3.0,
  High: 2.0,
  Medium: 1.25,
  Low: 1.0,
};
export const DEFAULT_CRITICALITY = 1.25;

/* ------------------------------------------------------------------ A3
   doc_type is not a controlled vocabulary — the upload form offers whatever
   strings that compliance's evidence_required array happens to contain, so
   values are free text like "ITR-V acknowledgement" or "Bank challan
   counterfoil". Quality is therefore classified by keyword against the
   document type and the file name, most authoritative tier first. The first
   tier that matches wins, so order is significant. */
export type EvidenceTier = {
  key: string;
  label: string;
  /** 0…1. Multiplies into the points an obligation earns. */
  quality: number;
  /** Lower-cased substrings; any match puts the document in this tier. */
  match: string[];
};

export const EVIDENCE_TIERS: EvidenceTier[] = [
  { key: 'gov_ack', label: 'Government acknowledgement', quality: 1.00,
    match: ['acknowledg', 'ack.', 'arn', 'utr', 'itr-v', 'counterfoil', 'e-verif', 'filed return', 'return filed'] },
  { key: 'gov_portal', label: 'Government portal document', quality: 1.00,
    match: ['portal', 'govt', 'government', 'gstr', 'form 16', 'form16', 'ecr', 'challan cum', 'stamped'] },
  { key: 'signed_return', label: 'Signed return', quality: 0.95,
    match: ['signed', 'return', 'filing', 'declaration'] },
  { key: 'bank_challan', label: 'Bank challan / payment proof', quality: 0.90,
    match: ['challan', 'payment', 'remittance', 'paid', 'transaction'] },
  { key: 'ca_cert', label: 'Professional certificate', quality: 0.85,
    match: ['certificate', 'certif', 'auditor', 'chartered', 'cs ', 'attestation'] },
  { key: 'computation', label: 'Computation / working', quality: 0.80,
    match: ['computation', 'working', 'reconcil', 'statement', 'register'] },
  { key: 'internal', label: 'Internal approval', quality: 0.70,
    match: ['internal', 'approval', 'board', 'minutes', 'resolution'] },
  { key: 'email', label: 'Email correspondence', quality: 0.50,
    match: ['email', 'e-mail', 'mail', 'correspond', 'letter'] },
  { key: 'screenshot', label: 'Screenshot', quality: 0.35,
    match: ['screenshot', 'screen shot', 'screen-grab', 'capture'] },
  { key: 'draft', label: 'Draft document', quality: 0.10,
    match: ['draft', 'unsigned', 'provisional'] },
];

/** Anything uploaded that matches no tier. Deliberately mid-range: an
    unclassified document is not worthless, it is simply unproven. */
export const EVIDENCE_UNCLASSIFIED = 0.60;
/** A nil filing carries no document by design, so it is not penalised for
    lacking one — the reviewer's approval is the evidence. */
export const EVIDENCE_NIL = 0.90;
/** No document on file at all. */
export const EVIDENCE_NONE = 0;

/** How hard evidence quality bites. points × (FLOOR + (1 − FLOOR) × quality),
    so perfect evidence is ×1.00 and a draft is ×0.775 rather than ×0.10 —
    the document's weakness should shade the score, not erase the filing. */
export const EVIDENCE_FLOOR = 0.75;

/* ------------------------------------------------------------- SQL emit
   The classifier has to run inside the aggregate query, but the rules must
   not be duplicated there — a weight that disagrees with this file would be
   undiscoverable. These helpers emit SQL from the constants above so there
   stays exactly one source of truth. */

function sqlStr(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/** CASE expression mapping compliances.risk_level to its multiplier. */
export function criticalitySql(riskCol: string): string {
  const arms = Object.entries(CRITICALITY_WEIGHT)
    .map(([level, w]) => `WHEN ${sqlStr(level)} THEN ${w.toFixed(2)}`)
    .join(' ');
  return `CASE ${riskCol} ${arms} ELSE ${DEFAULT_CRITICALITY.toFixed(2)} END`;
}

/** CASE expression scoring one evidence row 0…1 from its doc_type/file_name. */
export function evidenceQualitySql(docTypeCol: string, fileNameCol: string, isNilCol: string): string {
  const arms = EVIDENCE_TIERS.map(t => {
    const tests = t.match
      .map(m => `lower(coalesce(${docTypeCol},'') || ' ' || coalesce(${fileNameCol},'')) LIKE ${sqlStr('%' + m.toLowerCase() + '%')}`)
      .join(' OR ');
    return `WHEN ${tests} THEN ${t.quality.toFixed(2)}`;
  }).join('\n           ');
  return `CASE WHEN ${isNilCol} THEN ${EVIDENCE_NIL.toFixed(2)}
           ${arms}
           ELSE ${EVIDENCE_UNCLASSIFIED.toFixed(2)} END`;
}

/** Classify a single document in TypeScript — same rules, for display. */
export function classifyEvidence(docType: string | null, fileName: string | null, isNil = false): EvidenceTier | { key: string; label: string; quality: number } {
  if (isNil) return { key: 'nil', label: 'Nil filing', quality: EVIDENCE_NIL };
  const hay = `${docType ?? ''} ${fileName ?? ''}`.toLowerCase();
  const hit = EVIDENCE_TIERS.find(t => t.match.some(m => hay.includes(m.toLowerCase())));
  return hit ?? { key: 'unclassified', label: 'Unclassified document', quality: EVIDENCE_UNCLASSIFIED };
}

/** The evidence multiplier actually applied to points. */
export function evidenceFactor(quality: number): number {
  return EVIDENCE_FLOOR + (1 - EVIDENCE_FLOOR) * Math.max(0, Math.min(1, quality));
}
export function evidenceFactorSql(qualityExpr: string): string {
  return `(${EVIDENCE_FLOOR.toFixed(2)} + ${(1 - EVIDENCE_FLOOR).toFixed(2)} * ${qualityExpr})`;
}
