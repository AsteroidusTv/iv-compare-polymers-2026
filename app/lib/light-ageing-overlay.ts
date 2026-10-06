import type { IVDataset } from './iv-data';
import type { LightAgeingMetricKey } from './light-ageing-metrics';
import { normalizationTraces } from './normalization-trace';

export type LightSweep = 'mean' | 'forward' | 'reverse';
export const LIGHT_OVERLAY_QUANTITIES = [
  { stem: 'pout', suffix: 'mW_cm2', label: 'Pout', color: '#17233b', dash: '' },
  { stem: 'jsc', suffix: 'mA_cm2', label: 'Jsc', color: '#c65d00', dash: '10 5' },
  { stem: 'voc', suffix: 'V', label: 'Voc', color: '#365f80', dash: '3 5' },
  { stem: 'ff', suffix: 'pct', label: 'FF', color: '#843c98', dash: '12 4 3 4' },
] as const;

/** Each cell retains its own acquisition grid. No cross-cell averaging or interpolation. */
export function lightAgeingOverlay(dataset: IVDataset, sampleUids: string[], sweep: LightSweep, graphEnd: number | null = null) {
  const panels = LIGHT_OVERLAY_QUANTITIES.map(quantity => {
    const metric = `light_${quantity.stem}_${sweep}_${quantity.suffix}` as LightAgeingMetricKey;
    return { ...quantity, metric, traces: normalizationTraces(dataset, {
      sampleUids, protocol: 'Light ageing', metric, mode: 'retention', includeQa: false,
      outdoorWindow: 7, qaIssues: new Map(),
    }) };
  });
  return dataset.samples.filter(sample => sampleUids.includes(sample.sample_uid)).map(sample => {
    const times = [...new Set(panels[0].traces.filter(trace => trace.observation.sample_uid === sample.sample_uid)
      .map(trace => trace.observation.exposure_duration_numeric).filter((time): time is number => typeof time === 'number' && Number.isFinite(time)))].sort((a, b) => a - b);
    return { sample, sweep, graphEnd, allTimes: times, panels: panels.map(panel => {
      const traces = panel.traces.filter(trace => trace.observation.sample_uid === sample.sample_uid);
      return { ...panel, traces, points: times.filter(time => graphEnd === null || time <= graphEnd).map(time => {
        const matches = traces.filter(trace => trace.observation.exposure_duration_numeric === time);
        const trace = matches[0] ?? null;
        return { time, value: matches.length === 1 ? trace!.value : null, trace,
          reasons: matches.length > 1 ? ['ambiguous_duplicate_observation'] : trace?.exclusions ?? ['missing_at_exact_time'] };
      }) };
    }) };
  });
}
