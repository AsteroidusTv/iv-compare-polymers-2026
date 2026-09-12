import type { Observation, Sample } from "./iv-data";
import { numeric, quantile } from "./science";

export interface EncapsulationPair {
  sampleUid: string;
  reference: string;
  before: number;
  after: number;
}

export interface EncapsulationGroup {
  key: string;
  family: string;
  material: string;
  batch: string;
  electrode: string;
  pairs: EncapsulationPair[];
}

// Require a unique, unflagged Unaged measurement; never choose an arbitrary replicate.
export function encapsulationGroups(samples: Sample[], observations: Observation[], materials: string[]) {
  const unaged = new Map<string, Observation[]>();
  for (const observation of observations) {
    if (observation.test_type !== "Unaged") continue;
    const rows = unaged.get(observation.sample_uid) ?? [];
    rows.push(observation);
    unaged.set(observation.sample_uid, rows);
  }
  const groups = new Map<string, EncapsulationGroup>();
  let excluded = 0;
  for (const sample of samples) {
    if (!materials.includes(sample.material_family)) continue;
    const rows = unaged.get(sample.sample_uid) ?? [];
    const before = sample.initial_efficiency_pct;
    const after = rows[0]?.efficiency_pct;
    if (!numeric(before) || before < 0 || rows.length !== 1 || !numeric(after) || after < 0 || rows[0].data_quality_flag) {
      excluded += 1;
      continue;
    }
    const material = sample.material_raw || sample.material_family;
    const batch = sample.batch_no_raw || "Unknown";
    const electrode = sample.electrode || "Unknown";
    const key = JSON.stringify([sample.material_family, material, batch, electrode]);
    const group = groups.get(key) ?? { key, family: sample.material_family, material, batch, electrode, pairs: [] };
    group.pairs.push({ sampleUid: sample.sample_uid, reference: sample.sample_id_raw || sample.sample_uid, before, after });
    groups.set(key, group);
  }
  return { groups: [...groups.values()], excluded };
}

export function boxStatistics(values: number[]) {
  const q1 = quantile(values, 0.25);
  const q3 = quantile(values, 0.75);
  const inside = values.filter((value) => value >= q1 - 1.5 * (q3 - q1) && value <= q3 + 1.5 * (q3 - q1));
  return { q1, median: quantile(values, 0.5), q3, low: Math.min(...inside), high: Math.max(...inside) };
}
