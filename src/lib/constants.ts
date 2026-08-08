/** A "not applicable" decision always names one of these — free text was
    dropped in favour of a fixed list so the audit trail reads consistently
    and doesn't depend on whatever a reviewer happened to type. Shared by the
    dedicated Exclusions page and the entity detail page's own Applicability
    tab, which both let a reviewer make this call. */
export const NOT_APPLICABLE_REASONS = [
  'Entity not registered under this law',
  'Threshold / criteria not met',
  'Not applicable to this business activity',
  'Compliance discontinued or licence surrendered',
  'Others',
] as const;
