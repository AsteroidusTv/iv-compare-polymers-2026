import type { Aggregation, Measurement, MetricKey, Observation } from "./iv-data";
import { sourceQualityFlagApplies } from "./source-quality";

export function numeric(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function quantile(values: number[], percentile: number): number {
  if (!values.length) return Number.NaN;
  const ordered = [...values].sort((left, right) => left - right);
  if (ordered.length === 1) return ordered[0];
  const position = (ordered.length - 1) * percentile;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return ordered[lower] + (ordered[Math.min(lower + 1, ordered.length - 1)] - ordered[lower]) * fraction;
}

export function median(values: number[]): number {
  return quantile(values, 0.5);
}

export interface SummaryStatistics {
  value: number;
  intervalLow: number;
  intervalHigh: number;
  intervalLabel: "95% CI" | "IQR" | "single value";
  min: number;
  max: number;
  n: number;
}

const T_CRITICAL_95 = [
  Number.NaN,
  Number.NaN,
  12.706,
  4.303,
  3.182,
  2.776,
  2.571,
  2.447,
  2.365,
  2.306,
  2.262,
  2.228,
  2.201,
  2.179,
  2.16,
  2.145,
  2.131,
  2.12,
  2.11,
  2.101,
  2.093,
  2.086,
  2.08,
  2.074,
  2.069,
  2.064,
  2.06,
  2.056,
  2.052,
  2.048,
  2.045,
];

export function summarise(values: number[], method: Aggregation): SummaryStatistics {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) throw new Error("Cannot summarise an empty set of finite values.");
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (finite.length === 1) {
    return { value: finite[0], intervalLow: finite[0], intervalHigh: finite[0], intervalLabel: "single value", min, max, n: 1 };
  }
  if (method === "median") {
    // Two observations stay inspectable, but do not acquire a box/IQR which
    // visually suggests a well-characterised distribution.
    if (finite.length === 2) {
      const value = median(finite);
      return { value, intervalLow: value, intervalHigh: value, intervalLabel: "single value", min, max, n: 2 };
    }
    return {
      value: median(finite),
      intervalLow: quantile(finite, 0.25),
      intervalHigh: quantile(finite, 0.75),
      intervalLabel: "IQR",
      min,
      max,
      n: finite.length,
    };
  }
  const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length;
  const variance = finite.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (finite.length - 1);
  const standardError = Math.sqrt(variance / finite.length);
  const critical = finite.length <= 30 ? T_CRITICAL_95[finite.length] : 1.96;
  const margin = critical * standardError;
  return { value: mean, intervalLow: mean - margin, intervalHigh: mean + margin, intervalLabel: "95% CI", min, max, n: finite.length };
}

export function aggregate(values: number[], method: Aggregation): number {
  return summarise(values, method).value;
}

export function measurementQualityReasons(measurement: Measurement): string[] {
  const reasons = measurement.qa_flags ? [measurement.qa_flags] : [];
  const checks: Array<[number | null | undefined, number, number, string]> = [
    [measurement.efficiency_pct, 0, 50, "efficiency outside 0–50%"],
    [measurement.jsc_mA_cm2, 0, 100, "Jsc outside 0–100 mA/cm²"],
    [measurement.voc_V, 0, 5, "Voc outside 0–5 V"],
    [measurement.ff_pct, 0, 100, "fill factor outside 0–100%"],
  ];
  checks.forEach(([value, lower, upper, reason]) => {
    if (numeric(value) && (value < lower || value > upper)) reasons.push(reason);
  });
  if (numeric(measurement.point_count) && measurement.point_count < 3) reasons.push("fewer than 3 IV points");
  return [...new Set(reasons)];
}

export function chooseRepresentativeMeasurement(measurements: Measurement[]): Measurement | null {
  if (!measurements.length) return null;
  const withEfficiency = measurements.filter((measurement) => numeric(measurement.efficiency_pct));
  if (!withEfficiency.length) return [...measurements].sort((left, right) => left.measurement_uid.localeCompare(right.measurement_uid))[0];
  const centre = median(withEfficiency.map((measurement) => measurement.efficiency_pct as number));
  return [...withEfficiency].sort((left, right) => {
    const distance = Math.abs((left.efficiency_pct as number) - centre) - Math.abs((right.efficiency_pct as number) - centre);
    return distance || left.measurement_uid.localeCompare(right.measurement_uid);
  })[0];
}

export interface TimedValue {
  time: number;
  value: number;
}

export function outdoorQualityReason(observation: Observation, metric: MetricKey, peers: TimedValue[]): string | null {
  const value = observation[metric];
  if (!numeric(value)) return null;
  if (sourceQualityFlagApplies(observation.data_quality_flag,metric)) return `Source QA flag: ${observation.data_quality_flag}`;
  if (metric === "outdoor_pr_pct" && (value < 0 || value > 150)) return `PR ${value} is outside the 0–150% plausibility range.`;
  if (metric === "outdoor_irradiance_W_m2" && (value < 0 || value > 1_600)) return `Irradiance ${value} W/m² is outside the 0–1,600 W/m² sensor range.`;
  if (metric === "outdoor_pmpp_W" && value < 0) return "Outdoor Pmpp cannot be negative.";
  if (!numeric(observation.exposure_duration_numeric)) return null;

  const time = observation.exposure_duration_numeric;
  // The installation-day logger value can precede a stable operating state.
  // Only reject an isolated day-0 dropout with two consecutive, agreeing days;
  // persistent low output remains available as a possible real failure.
  if (time === 0 && (metric === "outdoor_pr_pct" || metric === "outdoor_pmpp_W")) {
    const next = [1, 2].map((day) => peers.find((peer) => peer.time === day)?.value);
    if (next.every((peer): peer is number => numeric(peer) && peer > 0)
      && Math.max(...next) / Math.min(...next) < 1.35
      && value < Math.min(...next) * 0.25) {
      return `Installation-day dropout (${value}) followed by stable recovery on days 1 and 2; startup measurement is not a valid baseline.`;
    }
  }
  const local = peers
    .filter((peer) => peer.time !== time)
    .sort((left, right) => Math.abs(left.time - time) - Math.abs(right.time - time))
    .slice(0, 14)
    .map((peer) => peer.value);
  if (local.length < 6) return null;
  const centre = median(local);
  if (centre <= 0) return null;
  const mad = median(local.map((peer) => Math.abs(peer - centre)));
  const robustSigma = mad * 1.4826;
  const highLimit = centre + Math.max(6 * robustSigma, centre * 1.5);
  if (value > highLimit) return `${value} is an isolated high-side spike relative to neighbouring days (local median ${centre}).`;

  const adjacentPeers = peers.filter((peer) => Math.abs(peer.time - time) <= 2 && peer.time !== time && numeric(peer.value) && peer.value > 0);
  const adjacent = adjacentPeers.map((peer) => peer.value);
  if (adjacentPeers.some((peer) => peer.time < time) && adjacentPeers.some((peer) => peer.time > time) && value < centre * 0.25 && Math.max(...adjacent) / Math.min(...adjacent) < 1.35) {
    return `${value} is an isolated dropout followed by recovery (local median ${centre}).`;
  }
  return null;
}

export interface BaselineResult {
  value: number | null;
  count: number;
  sensitivityPct: number | null;
}

export function outdoorBaseline(values: number[], window: 3 | 7 | 14 = 7): BaselineResult {
  const finite = values.filter(Number.isFinite);
  if (finite.length < 3) return { value: null, count: finite.length, sensitivityPct: null };
  const firstWindow = finite.slice(0, window);
  const value = median(firstWindow);
  const windows = [3, 7, 14]
    .filter((size) => finite.length >= size)
    .map((size) => median(finite.slice(0, size)));
  const sensitivityPct = windows.length > 1 && value !== 0
    ? ((Math.max(...windows) - Math.min(...windows)) / Math.abs(value)) * 100
    : null;
  return { value, count: firstWindow.length, sensitivityPct };
}
