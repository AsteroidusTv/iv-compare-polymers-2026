import { PEARL_METRIC_DEFINITIONS, PEARL_QUANTITIES } from './pearl-metrics.mjs';
import type { MetricKey } from './iv-data';

type QuantityKey<Q> = Q extends { stem: infer S extends string; suffix: infer U extends string }
  ? `light_${S}_${'forward' | 'reverse' | 'mean'}_${U}` : never;
export type LightAgeingMetricKey = QuantityKey<(typeof PEARL_QUANTITIES)[number]>
  | `light_temperature_${1 | 2 | 3 | 4}_C` | `light_photo_${1 | 2 | 3 | 4}_raw`;

export interface PearlMetricDefinition {
  label: string; figureLabel: string; family: string; unit: string; digits: number;
  signed: boolean; contextOnly: boolean; direction?: string;
  forwardKey?: LightAgeingMetricKey; reverseKey?: LightAgeingMetricKey;
}
export const LIGHT_METRICS = PEARL_METRIC_DEFINITIONS as Record<LightAgeingMetricKey, PearlMetricDefinition>;
export const LIGHT_METRIC_KEYS = Object.keys(LIGHT_METRICS) as LightAgeingMetricKey[];
export function pearlMetric(metric: MetricKey): PearlMetricDefinition | undefined {
  return LIGHT_METRICS[metric as LightAgeingMetricKey];
}
/** Environmental signals are context, not performance retention (notably temperature in °C). */
export function metricValueMode(metric: MetricKey, mode: 'absolute' | 'retention'): 'absolute' | 'retention' {
  return pearlMetric(metric)?.contextOnly ? 'absolute' : mode;
}
