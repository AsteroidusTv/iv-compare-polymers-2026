import { IVDataset, MetricKey, Sample } from "./iv-data";

export interface SeriesConfig {
  id: string;
  material: string;
  stress: string;
  metric: MetricKey;
  electrode: string;
  recipe: string;
  formulation?: string;
  batch?: string;
}

export const IV_METRICS: MetricKey[] = ["efficiency_pct", "jsc_mA_cm2", "voc_V", "ff_pct"];
export const OUTDOOR_METRICS: MetricKey[] = ["outdoor_pr_pct", "outdoor_pmpp_W", "outdoor_irradiance_W_m2"];
const STRESS_ORDER = ["DH", "TC", "Outdoor", "Unaged", "DH+TC"];

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((left, right) => left.localeCompare(right, "en"));
}

export function metricOptionsFor(stress: string): MetricKey[] {
  return stress === "Outdoor" ? OUTDOOR_METRICS : IV_METRICS;
}

type SampleFilters = Pick<SeriesConfig, "material" | "electrode" | "recipe" | "formulation" | "batch">;

function matchesSample(sample: Sample, config: SampleFilters): boolean {
  const selected = (filter: string | undefined, actual: string | null | undefined) => !filter || filter === "all" || filter === actual;
  return sample.material_family === config.material
    && selected(config.electrode, sample.electrode)
    && selected(config.recipe, sample.recipe_uid ?? sample.recipe_raw)
    && selected(config.formulation, sample.material_raw)
    && selected(config.batch, sample.batch_no_raw);
}

export function samplesForConfig(dataset: IVDataset, config: SampleFilters): Sample[] {
  return dataset.samples.filter((sample) => matchesSample(sample, config));
}

export function seriesSamplePasses(dataset: IVDataset, sampleId: string | null | undefined, config: SeriesConfig): boolean {
  if (!sampleId) return false;
  const sample = dataset.samples.find((item) => item.sample_uid === sampleId);
  return Boolean(sample && matchesSample(sample, config));
}

export function stressesForConfig(dataset: IVDataset, config: SampleFilters): string[] {
  const sampleIds = new Set(samplesForConfig(dataset, config).map((sample) => sample.sample_uid));
  const available = unique(dataset.observations.filter((observation) => sampleIds.has(observation.sample_uid)).map((observation) => observation.test_type));
  const ordered = STRESS_ORDER.filter((stress) => available.includes(stress));
  return [...ordered, ...available.filter((stress) => !ordered.includes(stress))];
}

export function normalizeSeriesConfig(dataset: IVDataset, config: SeriesConfig): SeriesConfig {
  const materials = unique(dataset.samples.map((sample) => sample.material_family));
  const material = materials.includes(config.material) ? config.material : materials[0] ?? "";
  // Preserve explicit filters even when they currently match no observations.
  // Broadening them silently would change the scientific population.
  const electrode = config.electrode || "all";
  const recipe = config.recipe || "all";
  const stresses = stressesForConfig(dataset, { ...config, material, electrode, recipe });
  const stress = stresses.includes(config.stress) ? config.stress : stresses[0] ?? "Unaged";
  const metrics = metricOptionsFor(stress);
  const metric = metrics.includes(config.metric) ? config.metric : stress === "Outdoor" ? "outdoor_pr_pct" : "efficiency_pct";
  return { ...config, material, electrode, recipe, stress, metric };
}

export function createInitialSeries(dataset: IVDataset): SeriesConfig[] {
  const materials = unique(dataset.samples.map((sample) => sample.material_family));
  const preferredA = materials.includes("POE-1 / Mitsui") ? "POE-1 / Mitsui" : materials[0] ?? "";
  const preferredB = materials.includes("POE-2 / TF4") ? "POE-2 / TF4" : materials.find((item) => item !== preferredA) ?? preferredA;
  return [preferredA, preferredB].map((material, index) => normalizeSeriesConfig(dataset, {
    id: String.fromCharCode(97 + index),
    material,
    stress: "DH",
    metric: "efficiency_pct",
    electrode: "all",
    recipe: "all",
  }));
}
