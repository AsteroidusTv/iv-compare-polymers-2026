import type { IVDataset, MetricKey, Observation } from "./iv-data";
import { numeric, outdoorBaseline } from "./science";
import { sourceQualityFlagApplies } from "./lab-quality";

export interface BaselineTrace {
  status: "valid" | "missing_baseline" | "zero_baseline" | "negative_baseline" | "ambiguous_baseline";
  value: number | null;
  observations: Observation[];
  definition: string;
  low: boolean;
  sensitivityPct: number | null;
}
export interface NormalizationTrace {
  version: "1.0.0";
  observation: Observation;
  absoluteValue: number | null;
  value: number | null;
  baseline: BaselineTrace | null;
  rule: "absolute" | "100 * individual_value / individual_baseline";
  qaReasons: string[];
  exclusions: string[];
}

export function normalizationTraces(dataset: IVDataset, options: {
  sampleUids: string[]; protocol: string; metric: MetricKey; mode: "absolute" | "retention";
  includeQa: boolean; outdoorWindow: 3 | 7 | 14; qaIssues: ReadonlyMap<string, string>;
}): NormalizationTrace[] {
  const { metric, protocol } = options;
  const ids = new Set(options.sampleUids), baselines = new Map<string, BaselineTrace>();
  const qaReasons = (row: Observation) => [...new Set([
    options.qaIssues.get(row.observation_uid),
    sourceQualityFlagApplies(row.data_quality_flag, metric) ? `Source QA: ${row.data_quality_flag}` : null,
  ].filter((value): value is string => Boolean(value)))];
  const baselineFor = (sampleUid: string): BaselineTrace => {
    const cached = baselines.get(sampleUid); if (cached) return cached;
    const rows = dataset.observations.filter(row => row.sample_uid === sampleUid
      && row.test_type === (protocol === "Outdoor" ? "Outdoor" : "Unaged")
      && numeric(row[metric]) && (protocol === "Outdoor" ? qaReasons(row).length === 0 : options.includeQa || qaReasons(row).length === 0))
      .sort((a,b) => (a.exposure_duration_numeric ?? 0) - (b.exposure_duration_numeric ?? 0));
    const observations = protocol === "Outdoor" ? rows.slice(0, options.outdoorWindow) : rows;
    const outdoor = protocol === "Outdoor" ? outdoorBaseline(rows.map(row => row[metric] as number), options.outdoorWindow) : null;
    const value = outdoor ? outdoor.value : rows.length === 1 ? rows[0][metric] as number : null;
    const status = protocol !== "Outdoor" && rows.length > 1 ? "ambiguous_baseline" : value === null ? "missing_baseline" : value === 0 ? "zero_baseline" : value < 0 ? "negative_baseline" : "valid";
    const result: BaselineTrace = { status, value, observations, low: metric === "efficiency_pct" && value !== null && value > 0 && value < 0.5,
      definition: protocol === "Outdoor" ? `B${options.outdoorWindow}: median of first up to ${options.outdoorWindow} QA-valid daily observations; minimum 3` : "Unique same-specimen Unaged observation",
      sensitivityPct: outdoor?.sensitivityPct ?? null };
    baselines.set(sampleUid, result); return result;
  };
  const result: NormalizationTrace[] = dataset.observations.filter(row => ids.has(row.sample_uid) && row.test_type === protocol).map(observation => {
    const absoluteValue = numeric(observation[metric]) ? observation[metric] as number : null;
    const reasons = qaReasons(observation), exclusions: string[] = [];
    if (absoluteValue === null) exclusions.push("non_numeric_metric");
    if (!options.includeQa && reasons.length) exclusions.push("qa_metric");
    if (protocol !== "Unaged" && !numeric(observation.exposure_duration_numeric)) exclusions.push("missing_time");
    const baseline = options.mode === "retention" ? baselineFor(observation.sample_uid) : null;
    if (baseline && baseline.status !== "valid") exclusions.push(baseline.status);
    return { version: "1.0.0", observation, absoluteValue, baseline, qaReasons: reasons, exclusions,
      rule: options.mode === "absolute" ? "absolute" : "100 * individual_value / individual_baseline",
      value: exclusions.length ? null : baseline ? 100 * absoluteValue! / baseline.value! : absoluteValue };
  });
  const counts = new Map<string, number>();
  const key = (trace: NormalizationTrace) => JSON.stringify([trace.observation.sample_uid, protocol === "Unaged" ? 0 : trace.observation.exposure_duration_numeric]);
  for (const trace of result) counts.set(key(trace), (counts.get(key(trace)) ?? 0) + 1);
  for (const trace of result) if ((counts.get(key(trace)) ?? 0) > 1) {
    trace.exclusions.push("ambiguous_duplicate_observation"); trace.value = null;
  }
  return result;
}
