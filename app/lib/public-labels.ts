import type { Sample } from './iv-data';

const MATERIAL_NAMES: Record<string, string> = {
  'POE-1 / Mitsui': 'POE-1',
  'POE-2 / TF4': 'POE-2',
  'POE-3 / Cybrid T22': 'POE-3',
  'TPO-1 / DNP-CVF': 'TPO-1',
  'TPO-2 / Lenzing': 'TPO-2',
};

/** Display wording only. Stored material families, filters and colour keys stay intact. */
export function materialLabel(label: string): string {
  return Object.entries(MATERIAL_NAMES).reduce((text, [recorded, display]) => text.replaceAll(recorded, display), label);
}

export function protocolLabel(protocol: string) {
  return ({ DH: 'Damp heat (DH)', TC: 'Thermal cycling (TC)', Outdoor: 'Outdoor exposure',
    'Light ageing': 'Light ageing', Unaged: 'Before ageing · after encapsulation' } as Record<string, string>)[protocol] ?? protocol;
}

/** Presentation only: archival identifiers remain unchanged in provenance exports. */
export function recordedCellNumber(sample: Pick<Sample, 'sample_id_raw'>): string | null {
  const raw = sample.sample_id_raw?.trim();
  if (!raw || /^SMP\d*-/i.test(raw)) return null;
  return raw.match(/(?:^|[_-])(\d+)(?:_R\d+)?$/)?.[1] ?? raw.match(/(?:len|TF4)[_-]?(\d+)$/i)?.[1] ?? null;
}
export function cellLabel(sample: Pick<Sample, 'sample_uid' | 'sample_id_raw'>) {
  const number = recordedCellNumber(sample);
  return number ? `Cell ${number}` : `Cell identifier ${sample.sample_uid.replace(/^SMP\d*-/, '')}`;
}

export function specimenLabel(sample: Sample) {
  return [materialLabel(sample.material_family), sample.batch_no_raw && `Batch ${sample.batch_no_raw.replace(/^#/, '')}`, cellLabel(sample)].filter(Boolean).join(' · ');
}

export function readableReason(reason: string) {
  const names: Record<string, string> = {missing_baseline: 'Missing initial reference', zero_baseline: 'Initial reference is zero',
    negative_baseline: 'Initial reference is negative', ambiguous_baseline: 'Multiple initial references',
    missing_time: 'Exposure time unavailable', non_numeric_metric: 'Measurement unavailable',
    qa_metric: 'Excluded by quality review', different_irradiance: 'Different illumination',
    missing_at_exact_time: 'No measurement at this time', ambiguous_duplicate_observation: 'Multiple measurements at the same time'};
  return names[reason] ?? reason.replace(/_/g, ' ');
}
