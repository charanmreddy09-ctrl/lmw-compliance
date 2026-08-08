/* ===========================================================================
   PENALTY COMPUTATION
   ---------------------------------------------------------------------------
   A late filing costs money in one of two shapes, and which shape applies is a
   property of the law, not of the filing:

     PER DAY    A fixed charge for each day of delay - GST's late fee, the
                late-filing fee on a TDS statement. Fully computable from the
                due date and the filing date, so nobody has to type anything.

     ON BASE    A percentage, or a flat sum, reckoned on a figure that only
                that filing knows: tax payable, turnover, value of supply.
                Interest works the same way and is additionally time-weighted.
                Not computable until the base figure is captured.

   A compliance can carry both (a daily fee AND interest on the tax due), so
   the mode is a set rather than a single choice.

   THE RATES ARE NOT IN THIS FILE. Nothing here encodes what GST charges per
   day or what interest the Income-tax Act levies. Those belong on the
   compliance library record, entered from the authority's own published
   schedule and revisable when a notification changes them - the same rule the
   platform already applies to due dates. This module only knows how to apply
   a rule it is handed, and returns every component so a CFO can be shown
   exactly how a figure was reached.
   =========================================================================== */

/** How a compliance's penalty is reckoned. Set on the library record. */
export type PenaltyRule = {
  /** Charge per day of delay, in `currency`. */
  perDay: number | null;
  /** Ceiling on the accumulated per-day charge. */
  perDayCap: number | null;
  /** Flat sum charged once, the moment a filing is late. */
  flat: number | null;
  /** Percentage of the base figure, charged once. */
  ratePct: number | null;
  /** Annual interest percentage on the base figure, accrued over the delay. */
  interestPct: number | null;
  /** Floor applied to the total, where the statute sets a minimum. */
  minimum: number | null;
  /** What the base figure is, in the authority's own words. Shown to the
      preparer when asking for it, so nobody guesses which number is wanted. */
  baseLabel: string | null;
  currency: string | null;
};

export type PenaltyComponent = {
  key: 'per_day' | 'flat' | 'rate' | 'interest' | 'minimum_applied' | 'cap_applied';
  label: string;
  amount: number;
  detail: string;
};

export type PenaltyResult = {
  /** null when the rule needs a base figure that has not been captured. */
  total: number | null;
  currency: string | null;
  delayDays: number;
  components: PenaltyComponent[];
  /** True when a base figure is required before a total can be produced. */
  needsBase: boolean;
  baseLabel: string | null;
  /** Plain-language summary of why the total is what it is, or why there
      isn't one. Shown wherever the figure appears. */
  note: string;
};

/** Whole days late. Zero when filed on or before the due date, and when the
    filing has not happened yet - an unfiled obligation accrues against today,
    which the caller passes as `asOf`. */
export function delayDays(dueDate: string | Date, filedDate: string | Date | null, asOf?: Date): number {
  const due = new Date(typeof dueDate === 'string' ? `${String(dueDate).slice(0, 10)}T00:00:00Z` : dueDate);
  const end = filedDate
    ? new Date(typeof filedDate === 'string' ? `${String(filedDate).slice(0, 10)}T00:00:00Z` : filedDate)
    : (asOf ?? new Date());
  if (isNaN(due.getTime()) || isNaN(end.getTime())) return 0;
  const days = Math.floor((end.getTime() - due.getTime()) / 86_400_000);
  return days > 0 ? days : 0;
}

/** Does this rule say anything at all? */
export function ruleIsSet(r: PenaltyRule | null): boolean {
  if (!r) return false;
  return [r.perDay, r.flat, r.ratePct, r.interestPct, r.minimum].some(v => v != null && v > 0);
}

/** Does producing a total require a figure only this filing knows? */
export function ruleNeedsBase(r: PenaltyRule | null): boolean {
  if (!r) return false;
  return (r.ratePct != null && r.ratePct > 0) || (r.interestPct != null && r.interestPct > 0);
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function computePenalty(
  rule: PenaltyRule | null,
  opts: { dueDate: string | Date; filedDate: string | Date | null; baseAmount?: number | null; asOf?: Date },
): PenaltyResult {
  const days = delayDays(opts.dueDate, opts.filedDate, opts.asOf);
  const currency = rule?.currency ?? null;
  const baseLabel = rule?.baseLabel ?? null;

  if (!ruleIsSet(rule)) {
    return {
      total: null, currency, delayDays: days, components: [], needsBase: false, baseLabel,
      note: 'No penalty rule is recorded against this compliance, so no exposure can be computed. Add the authority\'s published rate to the library record.',
    };
  }
  const r = rule as PenaltyRule;

  if (days <= 0) {
    return {
      total: 0, currency, delayDays: 0, components: [], needsBase: false, baseLabel,
      note: 'Filed on or before the due date, so nothing is payable.',
    };
  }

  const needsBase = ruleNeedsBase(r);
  const base = opts.baseAmount ?? null;
  if (needsBase && (base == null || base <= 0)) {
    return {
      total: null, currency, delayDays: days, components: [], needsBase: true, baseLabel,
      note: `${days} day${days === 1 ? '' : 's'} late. This penalty is reckoned on ${baseLabel ?? 'a base figure'}, which has to be captured before the amount can be worked out.`,
    };
  }

  const components: PenaltyComponent[] = [];

  /* Day-based charge, before any ceiling. */
  if (r.perDay != null && r.perDay > 0) {
    const gross = r.perDay * days;
    const capped = r.perDayCap != null && r.perDayCap > 0 ? Math.min(gross, r.perDayCap) : gross;
    components.push({
      key: 'per_day', label: 'Late fee',
      amount: r2(capped),
      detail: `${days} day${days === 1 ? '' : 's'} x ${r.perDay}`,
    });
    if (capped < gross) {
      components.push({
        key: 'cap_applied', label: 'Capped', amount: 0,
        detail: `Accrued ${r2(gross)}, capped at ${r.perDayCap}`,
      });
    }
  }

  if (r.flat != null && r.flat > 0) {
    components.push({ key: 'flat', label: 'Fixed penalty', amount: r2(r.flat), detail: 'Charged once on a late filing' });
  }

  if (r.ratePct != null && r.ratePct > 0 && base != null) {
    components.push({
      key: 'rate', label: 'Penalty on base', amount: r2((base * r.ratePct) / 100),
      detail: `${r.ratePct}% of ${baseLabel ?? 'base'} ${base}`,
    });
  }

  /* Interest accrues over the delay. Simple, on a 365-day year - which is how
     the statutes that use an annual rate express it. Anything reckoned per
     month should be entered as its annualised equivalent. */
  if (r.interestPct != null && r.interestPct > 0 && base != null) {
    components.push({
      key: 'interest', label: 'Interest', amount: r2((base * r.interestPct * days) / (100 * 365)),
      detail: `${r.interestPct}% a year on ${base} for ${days} day${days === 1 ? '' : 's'}`,
    });
  }

  let total = r2(components.reduce((sum, c) => sum + c.amount, 0));

  if (r.minimum != null && r.minimum > 0 && total < r.minimum) {
    components.push({
      key: 'minimum_applied', label: 'Statutory minimum', amount: r2(r.minimum - total),
      detail: `Computed ${total}, minimum ${r.minimum}`,
    });
    total = r2(r.minimum);
  }

  return {
    total, currency, delayDays: days, components, needsBase: false, baseLabel,
    note: `${days} day${days === 1 ? '' : 's'} late. ${components.filter(c => c.amount > 0).map(c => `${c.label} ${c.amount}`).join(', ')}.`,
  };
}

/** Money for display. Deliberately not Intl-locale-dependent on the server:
    the same figure has to read identically in a report, a table and a PDF. */
export function fmtMoney(amount: number | null, currency: string | null): string {
  if (amount == null) return '-';
  const n = amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${currency} ${n}` : n;
}
