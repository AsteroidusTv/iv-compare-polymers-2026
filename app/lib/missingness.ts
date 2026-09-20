import type { NormalizationTrace } from "./normalization-trace";

export type Missingness = "observed" | "measured_failure" | "missing_measurement" | "qa_excluded" | "followup_stopped" | "unknown";
export interface FollowupEvidence { sampleUid: string; time: number; status: "measured_failure" | "followup_stopped" | "missing_measurement"; source: string; reason: string }
/** A missing row has unknown cause unless an explicit, sourced record says otherwise. */
export function missingnessTable(traces: NormalizationTrace[], options: {
  protocol: string; times?: number[]; excludedSampleUids?: string[]; evidence?: FollowupEvidence[];
}) {
  const timeOf = (trace: NormalizationTrace) => options.protocol === "Unaged" ? 0 : trace.observation.exposure_duration_numeric;
  const times = options.times ?? [...new Set(traces.map(timeOf).filter((time): time is number => typeof time === "number" && Number.isFinite(time)))].sort((a,b)=>a-b);
  const sampleIds = [...new Set(traces.map(trace=>trace.observation.sample_uid))].sort();
  const excluded = new Set(options.excludedSampleUids ?? []);
  return times.flatMap(time => sampleIds.map(sampleUid => {
    const rows = traces.filter(trace => trace.observation.sample_uid === sampleUid && timeOf(trace) === time);
    const evidence = options.evidence?.find(item => item.sampleUid === sampleUid && item.time === time && item.source.trim() && item.reason.trim());
    const qa = rows.some(row => row.exclusions.includes("qa_metric"));
    const measured = rows.some(row => row.absoluteValue !== null);
    const status: Missingness = qa ? "qa_excluded" : measured ? evidence?.status === "measured_failure" ? "measured_failure" : "observed"
      : evidence?.status === "followup_stopped" || evidence?.status === "missing_measurement" ? evidence.status : "unknown";
    const exclusionReasons = [...new Set(rows.flatMap(row=>row.exclusions))];
    if (!rows.length) exclusionReasons.push("missing_at_exact_time");
    if (rows.length > 1) exclusionReasons.push("ambiguous_duplicate_observation");
    if (excluded.has(sampleUid)) exclusionReasons.push("user_excluded");
    return { sampleUid, time, status, evidence: evidence ?? null, observationIds: rows.map(row=>row.observation.observation_uid),
      absoluteValues: rows.map(row=>row.absoluteValue), contributes: rows.length === 1 && rows[0].value !== null && !excluded.has(sampleUid), exclusionReasons };
  }));
}
