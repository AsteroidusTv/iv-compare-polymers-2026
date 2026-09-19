/** Screening tolerances, not measurement uncertainties or calibration limits. */
export const JV_CONSISTENCY_RULES = {
  version: "2.0.0",
  jsc_mA_cm2: { relative: 0.25, absolute: 0.5, maximum: 100 },
  voc_V: { relative: 0.10, absolute: 0.05, maximum: 5 },
  pmpp_mW_cm2: { relative: 0.25, absolute: 0.5, maximum: null },
  ff_pct: { relative: 0.20, absolute: 5, maximum: 100 },
  efficiency_pct: { relative: 0.25, absolute: 1, maximum: 100 },
} as const;

export type JVMetric = Exclude<keyof typeof JV_CONSISTENCY_RULES, "version">;
export interface ValidationEvidence {
  status: "validated" | "unresolved";
  measurement_uid: string;
  source: string;
  reason: string;
  version: string;
  segment_id?: string;
}
export function evidenceValidated(evidence: ValidationEvidence | undefined, measurementUid: string, segmentId?: string): boolean {
  return Boolean(evidence && evidence.status === "validated" && evidence.measurement_uid === measurementUid
    && typeof evidence.source === "string" && evidence.source.trim()
    && typeof evidence.reason === "string" && evidence.reason.trim()
    && typeof evidence.version === "string" && evidence.version.trim()
    && (segmentId === undefined || evidence.segment_id === segmentId));
}

export function metricConsistency(metric: JVMetric, instrument: number | null, reconstructed: number | null) {
  const rule = JV_CONSISTENCY_RULES[metric];
  const invalid = (value: number | null) => value !== null && (!Number.isFinite(value) || value < 0 || (rule.maximum !== null && value > rule.maximum));
  const comparable = instrument !== null && reconstructed !== null;
  const threshold = instrument === null ? null : Math.max(rule.absolute, rule.relative * Math.abs(instrument));
  return {
    metric, instrument, reconstructed, threshold,
    status: invalid(instrument) || invalid(reconstructed) ? "physically_inconsistent" as const
      : !comparable ? "unavailable" as const
      : Math.abs(instrument! - reconstructed!) > threshold! ? "severe_mismatch" as const : "numerically_consistent" as const,
  };
}
