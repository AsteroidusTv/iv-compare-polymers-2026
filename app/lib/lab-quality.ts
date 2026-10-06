import type { MetricKey, Observation } from "./iv-data";
import { numeric } from "./science";

import { sourceQualityFlagApplies } from "./source-quality";
export { sourceQualityFlagApplies } from "./source-quality";

// Conservative review heuristic, not a diagnosis of measurement failure.
// Compare only the same cell, protocol and unit; retain sustained/terminal failures.
export function labQualityIssues(observations: Observation[], metric: MetricKey): Map<string, string> {
  const limits: Partial<Record<MetricKey, number>> = { efficiency_pct: 50, jsc_mA_cm2: 100, voc_V: 5, ff_pct: 100 };
  const upper = limits[metric];
  const issues = new Map<string, string>();
  if (upper === undefined) return issues;
  const trajectories = new Map<string, Observation[]>();
  for (const observation of observations) {
    if (observation.test_type === "Outdoor") continue;
    const value = observation[metric];
    if (sourceQualityFlagApplies(observation.data_quality_flag, metric)) issues.set(observation.observation_uid, `Source QA: ${observation.data_quality_flag}`);
    else if (numeric(value) && (value < 0 || value > upper)) issues.set(observation.observation_uid, `${metric} outside the review range 0–${upper}.`);
    if (!numeric(value) || !numeric(observation.exposure_duration_numeric) || issues.has(observation.observation_uid)) continue;
    const key = JSON.stringify([observation.sample_uid, observation.test_type, observation.exposure_unit]);
    const trajectory = trajectories.get(key) ?? [];
    trajectory.push(observation);
    trajectories.set(key, trajectory);
  }
  for (const trajectory of trajectories.values()) {
    trajectory.sort((a, b) => a.exposure_duration_numeric! - b.exposure_duration_numeric!);
    for (let i = 1; i < trajectory.length - 1; i += 1) {
      const [before, point, after] = trajectory.slice(i - 1, i + 2);
      if (!(before.exposure_duration_numeric! < point.exposure_duration_numeric! && point.exposure_duration_numeric! < after.exposure_duration_numeric!)) continue;
      const left = before[metric]!;
      const right = after[metric]!;
      if (left > 0 && right > 0 && Math.max(left, right) / Math.min(left, right) <= 1.35 && point[metric]! <= 0.1 * Math.min(left, right)) {
        issues.set(point.observation_uid, "Suspected isolated dropout: ≤10% of both neighbouring measurements, which agree within 35%. Review required; not confirmed invalid.");
      }
    }
  }
  return issues;
}

export function labObservationEligible(observation: Observation, issues: Map<string, string>, includeQa: boolean): boolean {
  return includeQa || (!sourceQualityFlagApplies(observation.data_quality_flag) && !issues.has(observation.observation_uid));
}
