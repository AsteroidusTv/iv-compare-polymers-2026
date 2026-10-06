import type { Sample } from './iv-data';

export function protocolLabel(protocol: string) {
  return ({ DH: 'Damp heat (DH)', TC: 'Thermal cycling (TC)', Outdoor: 'Outdoor exposure',
    'Light ageing': 'Light ageing', Unaged: 'Before ageing · after encapsulation' } as Record<string, string>)[protocol] ?? protocol;
}

/** Presentation only: archival identifiers remain unchanged in provenance exports. */
export function cellLabel(sample: Pick<Sample, 'sample_uid' | 'sample_id_raw'>) {
  const number = sample.sample_id_raw?.match(/(?:^|_)(\d+)(?:_R\d+)?$/)?.[1];
  return number ? `Cell ${number}` : `Cell ${sample.sample_uid.replace(/^SMP\d*-/, '')}`;
}

export function specimenLabel(sample: Sample) {
  return [sample.material_family, sample.batch_no_raw && `Batch ${sample.batch_no_raw.replace(/^#/, '')}`, cellLabel(sample)].filter(Boolean).join(' · ');
}

export function readableReason(reason: string) {
  const names: Record<string, string> = {missing_baseline: 'Missing initial reference', zero_baseline: 'Initial reference is zero',
    negative_baseline: 'Initial reference is negative', ambiguous_baseline: 'Multiple initial references',
    missing_time: 'Exposure time unavailable', non_numeric_metric: 'Measurement unavailable',
    qa_metric: 'Excluded by quality review', different_irradiance: 'Different illumination',
    missing_at_exact_time: 'No measurement at this time', ambiguous_duplicate_observation: 'Multiple measurements at the same time'};
  return names[reason] ?? reason.replace(/_/g, ' ');
}
