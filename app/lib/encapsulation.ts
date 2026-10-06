import type { IVFile, IVDataset, Measurement, Observation, Recipe, Sample } from "./iv-data";
import { measurementQualityReasons, numeric, quantile } from "./science";
import { recordedRibbon } from "./ribbon";

export interface EncapsulationPair {
  sampleUid: string;
  reference: string;
  before: number;
  after: number;
  beforeMeasurementDate: string | null;
  encapsulationDate: string | null;
  afterMeasurementDates: string[];
}

export interface EncapsulationGroup {
  key: string;
  family: string;
  material: string;
  batch: string;
  electrode: string;
  recipeUid: string | null;
  recipe: string | null;
  ribbon: string | null;
  pairs: EncapsulationPair[];
}

/** Label equipment using the lab's standard-laminator default, never an ambiguous raw recipe code. */
export function encapsulationDisplayLabels<T extends Pick<EncapsulationGroup, "key" | "material" | "batch" | "electrode" | "recipeUid"> & { ribbon?: string | null }>(groups: T[], recipes: Recipe[]) {
  const laminatorByUid = new Map(recipes.map((recipe) => [recipe.recipe_uid, recipe.laminator?.trim()]));
  const equipmentLabel = (group: T) => {
    const laminator = group.recipeUid ? laminatorByUid.get(group.recipeUid) : null;
    const normalized = laminator?.toLowerCase();
    if (!normalized || normalized === "unspecified" || normalized === "standard laminator") return "Lamineuse standard";
    if (normalized === "small laminator") return "Petite lamineuse";
    if (normalized === "no lamination") return "Sans lamination";
    return laminator;
  };
  const peers = new Map<string, T[]>();
  for (const group of groups) {
    const identity = JSON.stringify([group.material, group.batch, group.electrode, group.ribbon ?? null]);
    peers.set(identity, [...(peers.get(identity) ?? []), group]);
  }
  return new Map(groups.map((group) => {
    const identity = JSON.stringify([group.material, group.batch, group.electrode, group.ribbon ?? null]);
    const matching = peers.get(identity)!;
    const equipment = equipmentLabel(group);
    const sameEquipment = equipment ? matching.filter((peer) => equipmentLabel(peer) === equipment) : [];
    const label = equipment === "Lamineuse standard" && matching.length === 1 ? null
      : sameEquipment.length > 1 && equipment !== "Lamineuse standard"
        ? `${equipment} · groupe ${sameEquipment.findIndex((peer) => peer.key === group.key) + 1}`
        : equipment;
    return [group.key, label] as const;
  }));
}

export function meanPairedRelativeChange(pairs: EncapsulationPair[]) {
  const changes = pairs.filter((pair) => pair.before !== 0).map((pair) => (pair.after - pair.before) / pair.before * 100);
  return changes.length ? changes.reduce((sum, value) => sum + value, 0) / changes.length : null;
}

/** Summarise individual paired deltas, never substitute a change of means. */
export function pairedChanges(pairs: EncapsulationPair[]) {
  const individual = pairs.map(pair => ({ sampleUid: pair.sampleUid, absolute: pair.after - pair.before,
    relative: pair.before === 0 ? null : (pair.after - pair.before) / pair.before * 100 }));
  const summarize = (values: number[]) => ({ n: values.length,
    mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    median: values.length ? quantile(values, 0.5) : null });
  const totalBefore = pairs.reduce((sum, pair) => sum + pair.before, 0);
  return { individual, absolute: summarize(individual.map(row => row.absolute)),
    relative: summarize(individual.flatMap(row => row.relative === null ? [] : [row.relative])),
    relativeChangeOfGroupMeans: totalBefore === 0 ? null : pairs.reduce((sum, pair) => sum + pair.after - pair.before, 0) / totalBefore * 100 };
}

export function pairedMeasurementDayRange(pairs: EncapsulationPair[]) {
  const days = pairs.flatMap((pair) => {
    if (!pair.beforeMeasurementDate) return [];
    const before = Date.parse(`${pair.beforeMeasurementDate.slice(0, 10)}T00:00:00Z`);
    if (!Number.isFinite(before)) return [];
    return pair.afterMeasurementDates.flatMap((value) => {
      const after = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
      if (!Number.isFinite(after)) return [];
      return [Math.round((after - before) / 86_400_000)];
    });
  });
  return days.length ? { min: Math.min(...days), max: Math.max(...days) } : null;
}

// Require a unique, unflagged Unaged measurement; never choose an arbitrary replicate.
export function encapsulationGroups(samples: Sample[], observations: Observation[], materials: string[], files: IVFile[] = [], splitByRibbon = false) {
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
    const recipeUid = sample.recipe_uid || null;
    const recipe = sample.recipe_raw || null;
    const ribbon = recordedRibbon(sample);
    const key = JSON.stringify([sample.material_family, material, batch, electrode, recipeUid, recipe, ...(splitByRibbon ? [ribbon] : [])]);
    const group = groups.get(key) ?? { key, family: sample.material_family, material, batch, electrode, recipeUid, recipe, ribbon: splitByRibbon ? ribbon : null, pairs: [] };
    const referenceDates = [...new Set(files.filter((file) => file.reference_sample_uid === sample.sample_uid).map((file) => file.measurement_date).filter((value): value is string => Boolean(value)))].sort();
    const afterDates = [...new Set(files.filter((file) => file.sample_uid === sample.sample_uid && file.inferred_test_type === "Unaged" && (!file.matched_observation_uid || file.matched_observation_uid === rows[0].observation_uid)).map((file) => file.measurement_date).filter((value): value is string => Boolean(value)))].sort();
    group.pairs.push({
      sampleUid: sample.sample_uid,
      reference: sample.sample_id_raw || sample.sample_uid,
      before,
      after,
      beforeMeasurementDate: referenceDates.length === 1 ? referenceDates[0] : null,
      encapsulationDate: sample.encapsulation_date || null,
      afterMeasurementDates: afterDates,
    });
    groups.set(key, group);
  }
  return { groups: [...groups.values()], excluded };
}

export interface EncapsulationCurvePair {
  sample: Sample;
  beforeFile: IVFile;
  afterFiles: IVFile[];
  beforeMeasurement: Measurement;
  afterMeasurement: Measurement;
  beforeTargetPce: number;
  afterTargetPce: number;
}

function closestValidMeasurement(measurements: Measurement[], targetPce: number, dataset: IVDataset): Measurement | null {
  return measurements
    .filter((measurement) => dataset.curves[measurement.measurement_uid] && measurementQualityReasons(measurement).length === 0 && numeric(measurement.efficiency_pct))
    .sort((left, right) => Math.abs((left.efficiency_pct as number) - targetPce) - Math.abs((right.efficiency_pct as number) - targetPce) || left.measurement_uid.localeCompare(right.measurement_uid))[0] ?? null;
}

// Raw JV files contain several sweeps. Use the QA-valid sweep whose PCE is nearest
// the independently recorded inventory PCE at each stage; expose the exact sweep
// identifiers in the UI so this diagnostic choice stays auditable.
export function encapsulationCurvePairs(dataset: IVDataset): EncapsulationCurvePair[] {
  const observationsBySample = new Map<string, Observation[]>();
  dataset.observations.forEach((observation) => {
    if (observation.test_type !== "Unaged" || observation.data_quality_flag || !numeric(observation.efficiency_pct)) return;
    const rows = observationsBySample.get(observation.sample_uid) ?? [];
    rows.push(observation);
    observationsBySample.set(observation.sample_uid, rows);
  });
  return dataset.samples.flatMap((sample) => {
    if (!numeric(sample.initial_efficiency_pct)) return [];
    const observations = observationsBySample.get(sample.sample_uid) ?? [];
    if (observations.length !== 1) return [];
    const beforeFiles = dataset.files.filter((file) => file.reference_sample_uid === sample.sample_uid);
    if (beforeFiles.length !== 1) return [];
    const observation = observations[0];
    const exactAfterFiles = dataset.files.filter((file) => file.sample_uid === sample.sample_uid && file.inferred_test_type === "Unaged" && file.matched_observation_uid === observation.observation_uid);
    const afterFiles = exactAfterFiles.length ? exactAfterFiles : dataset.files.filter((file) => file.sample_uid === sample.sample_uid && file.inferred_test_type === "Unaged");
    if (!afterFiles.length) return [];
    const beforeFile = beforeFiles[0];
    const beforeMeasurement = closestValidMeasurement(dataset.measurements.filter((measurement) => measurement.file_uid === beforeFile.file_uid), sample.initial_efficiency_pct, dataset);
    const afterFileIds = new Set(afterFiles.map((file) => file.file_uid));
    const afterMeasurement = closestValidMeasurement(dataset.measurements.filter((measurement) => afterFileIds.has(measurement.file_uid)), observation.efficiency_pct as number, dataset);
    if (!beforeMeasurement || !afterMeasurement) return [];
    return [{ sample, beforeFile, afterFiles, beforeMeasurement, afterMeasurement, beforeTargetPce: sample.initial_efficiency_pct, afterTargetPce: observation.efficiency_pct as number }];
  });
}

export function boxStatistics(values: number[]) {
  const q1 = quantile(values, 0.25);
  const q3 = quantile(values, 0.75);
  const inside = values.filter((value) => value >= q1 - 1.5 * (q3 - q1) && value <= q3 + 1.5 * (q3 - q1));
  return { q1, median: quantile(values, 0.5), q3, low: Math.min(...inside), high: Math.max(...inside) };
}
