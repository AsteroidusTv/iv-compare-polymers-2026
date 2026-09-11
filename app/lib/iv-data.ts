export type MetricKey = "efficiency_pct" | "jsc_mA_cm2" | "voc_V" | "ff_pct" | "outdoor_pr_pct" | "outdoor_pmpp_W" | "outdoor_irradiance_W_m2";
export type Aggregation = "mean" | "median";

export interface Sample {
  sample_uid: string;
  batch_no_raw?: string | null;
  electrode?: string | null;
  encapsulation_date?: string | null;
  material_raw?: string | null;
  material_family: string;
  sample_id_raw?: string | null;
  sample_label?: string | null;
  recipe_uid?: string | null;
  recipe_raw?: string | null;
  frame_raw?: string | null;
  ribbon_raw?: string | null;
  sample_comments?: string | null;
  assigned_test?: string | null;
}

export interface Recipe {
  recipe_uid: string;
  recipe_raw?: string | null;
  laminator?: string | null;
  temperature_profile_C?: string | number | null;
  duration_profile_min?: string | null;
  duration_profile_s?: string | null;
  pressure_pairs_mbar?: string | null;
  pressure_values_mbar?: string | null;
}

export interface Observation {
  observation_uid: string;
  sample_uid: string;
  test_type: string;
  exposure_duration_numeric?: number | null;
  exposure_unit?: string | null;
  efficiency_pct?: number | null;
  jsc_mA_cm2?: number | null;
  voc_V?: number | null;
  ff_pct?: number | null;
  outdoor_pr_pct?: number | null;
  outdoor_pmpp_W?: number | null;
  outdoor_irradiance_W_m2?: number | null;
  action_or_status?: string | null;
  comments?: string | null;
  data_quality_flag?: string | null;
  source_file?: string | null;
  source_row?: number | null;
  aggregation_protocol?: string | null;
  raw_count?: number | null;
  daylight_count?: number | null;
}

export interface IVFile {
  file_uid: string;
  source_file?: string | null;
  inferred_test_type?: string | null;
  inferred_exposure_duration?: number | null;
  inferred_exposure_unit?: string | null;
  material_family_inferred?: string | null;
  measurement_date?: string | null;
  sample_uid?: string | null;
  match_status: string;
  match_score?: number | null;
  match_margin?: number | null;
  match_reasons?: string | null;
  matched_observation_uid?: string | null;
}

export interface Measurement {
  measurement_uid: string;
  file_uid: string;
  sample_uid?: string | null;
  match_status: string;
  sheet_name?: string | null;
  curve_series_index?: number | null;
  measurement_date?: string | null;
  measurement_time?: string | null;
  cell_area_cm2?: number | null;
  jsc_mA_cm2?: number | null;
  voc_V?: number | null;
  ff_pct?: number | null;
  efficiency_pct?: number | null;
  point_count?: number | null;
  qa_flags?: string | null;
}

export interface Curve {
  v: Array<number | null>;
  j: Array<number | null>;
}

export interface IVDataset {
  schemaVersion: string;
  name: string;
  generatedOn?: string;
  provenance?: {
    pipelineVersion: string;
    rawTreeSha256?: string;
    normalizedWorkbookSha256?: string;
    curvePointsSha256?: string;
    outdoorRawSha256?: string;
    rawFileCount?: number;
    notes?: string[];
  };
  report: {
    samples: number;
    recipes: number;
    observations: number;
    files: number;
    measurements: number;
    points: number;
    matchedFiles: number;
    reviewFiles: number;
    auditFiles?: number;
  };
  samples: Sample[];
  recipes: Recipe[];
  observations: Observation[];
  files: IVFile[];
  measurements: Measurement[];
  curves: Record<string, Curve>;
}

type UnknownRow = Record<string, unknown>;

const MAX_PACK_BYTES = 64 * 1024 * 1024;
const MAX_WORKBOOK_BYTES = 32 * 1024 * 1024;
const MAX_POINTS_BYTES = 256 * 1024 * 1024;
const MAX_ROWS = 2_000_000;
const SUPPORTED_SCHEMA_VERSIONS = new Set(["1.1", "1.2"]);

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function asText(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

export function asIsoDate(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  if (typeof value === "number" && value > 20_000 && value < 80_000) {
    return new Date(Date.UTC(1899, 11, 30) + value * 86_400_000).toISOString().slice(0, 10);
  }
  return asText(value);
}

function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (!value) throw new Error(`${label} contains an empty identifier.`);
    if (seen.has(value)) throw new Error(`${label} contains duplicate identifier ${value}.`);
    seen.add(value);
  }
}

export function validateDataset(value: unknown): IVDataset {
  if (!value || typeof value !== "object") throw new Error("The file does not contain a valid IV dataset.");
  const dataset = value as Partial<IVDataset>;
  const required = [dataset.samples, dataset.observations, dataset.files, dataset.measurements];
  if (required.some((entry) => !Array.isArray(entry)) || !dataset.curves || typeof dataset.curves !== "object") {
    throw new Error("Incomplete structure: samples, observations, files, measurements, or curves are missing.");
  }
  if (!dataset.schemaVersion || !SUPPORTED_SCHEMA_VERSIONS.has(dataset.schemaVersion)) {
    throw new Error(`Unsupported dataset schema ${dataset.schemaVersion ?? "(missing)"}. Expected version 1.1 or 1.2.`);
  }
  if (!dataset.report || typeof dataset.report !== "object") throw new Error("The dataset report is missing.");
  if (required.some((entry) => (entry?.length ?? 0) > MAX_ROWS) || Object.keys(dataset.curves).length > MAX_ROWS) {
    throw new Error("The dataset exceeds the supported row limit.");
  }

  const samples = dataset.samples as Sample[];
  const observations = dataset.observations as Observation[];
  const files = dataset.files as IVFile[];
  const measurements = dataset.measurements as Measurement[];
  assertUnique(samples.map((row) => row.sample_uid), "Samples");
  assertUnique(observations.map((row) => row.observation_uid), "Observations");
  assertUnique(files.map((row) => row.file_uid), "IV files");
  assertUnique(measurements.map((row) => row.measurement_uid), "Measurements");

  const sampleIds = new Set(samples.map((row) => row.sample_uid));
  const fileIds = new Set(files.map((row) => row.file_uid));
  observations.forEach((row) => {
    if (!sampleIds.has(row.sample_uid)) throw new Error(`Observation ${row.observation_uid} references unknown sample ${row.sample_uid}.`);
  });
  files.forEach((row) => {
    if (row.sample_uid && !sampleIds.has(row.sample_uid)) throw new Error(`File ${row.file_uid} references unknown sample ${row.sample_uid}.`);
  });
  let pointCount = 0;
  measurements.forEach((row) => {
    if (!fileIds.has(row.file_uid)) throw new Error(`Measurement ${row.measurement_uid} references unknown file ${row.file_uid}.`);
    if (row.sample_uid && !sampleIds.has(row.sample_uid)) throw new Error(`Measurement ${row.measurement_uid} references unknown sample ${row.sample_uid}.`);
    const curve = dataset.curves?.[row.measurement_uid];
    if (!curve) return;
    if (!Array.isArray(curve.v) || !Array.isArray(curve.j) || curve.v.length !== curve.j.length) {
      throw new Error(`Curve ${row.measurement_uid} has inconsistent voltage/current arrays.`);
    }
    if (numericCount(curve.v) !== curve.v.length || numericCount(curve.j) !== curve.j.length) throw new Error(`Curve ${row.measurement_uid} contains a non-finite point.`);
    if (row.point_count !== null && row.point_count !== undefined && row.point_count !== curve.v.length) {
      throw new Error(`Curve ${row.measurement_uid} has ${curve.v.length} points; metadata reports ${row.point_count}.`);
    }
    pointCount += curve.v.length;
  });
  if (dataset.report.samples !== samples.length || dataset.report.observations !== observations.length || dataset.report.files !== files.length || dataset.report.measurements !== measurements.length || dataset.report.points !== pointCount) {
    throw new Error("Dataset report counts do not match the imported records.");
  }
  return dataset as IVDataset;
}

function numericCount(values: Array<number | null>): number {
  return values.filter((item) => item === null || (typeof item === "number" && Number.isFinite(item))).length;
}

async function decodeBlob(blob: Blob): Promise<string> {
  if (blob.size > MAX_PACK_BYTES) throw new Error("The package is larger than the 64 MB safety limit.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!isGzip) return new TextDecoder().decode(bytes);
  if (!("DecompressionStream" in globalThis)) {
    throw new Error("This browser cannot decompress the .ivpack package.");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

export async function readPack(blob: Blob): Promise<IVDataset> {
  return validateDataset(JSON.parse(await decodeBlob(blob)));
}

export async function fetchDefaultDataset(): Promise<IVDataset> {
  const response = await fetch("/data/iv-compare-dowsil.ivpack", { cache: "no-store" });
  if (!response.ok) throw new Error("The supplied dataset could not be loaded.");
  return readPack(await response.blob());
}

function normalizeSamples(rows: UnknownRow[]): Sample[] {
  return rows.map((row) => ({
    sample_uid: String(row.sample_uid ?? ""),
    batch_no_raw: asText(row.batch_no_raw),
    electrode: asText(row.electrode),
    encapsulation_date: asIsoDate(row.encapsulation_date),
    material_raw: asText(row.material_raw),
    material_family: String(row.material_family ?? row.material_raw ?? "Unclassified"),
    sample_id_raw: asText(row.sample_id_raw),
    sample_label: asText(row.sample_label),
    recipe_uid: asText(row.recipe_uid),
    recipe_raw: asText(row.recipe_raw),
    frame_raw: asText(row.frame_raw),
    ribbon_raw: asText(row.ribbon_raw),
    sample_comments: asText(row.sample_comments),
    assigned_test: asText(row.assigned_test),
  })).filter((row) => row.sample_uid);
}

function normalizeRecipes(rows: UnknownRow[]): Recipe[] {
  return rows.map((row) => ({
    recipe_uid: String(row.recipe_uid ?? ""),
    recipe_raw: asText(row.recipe_raw),
    laminator: asText(row.laminator),
    temperature_profile_C: asText(row.temperature_profile_C),
    duration_profile_min: asText(row.duration_profile_min),
    duration_profile_s: asText(row.duration_profile_s),
    pressure_pairs_mbar: asText(row.pressure_pairs_mbar),
    pressure_values_mbar: asText(row.pressure_values_mbar),
  })).filter((row) => row.recipe_uid);
}

function normalizeObservations(rows: UnknownRow[]): Observation[] {
  return rows.map((row) => ({
    observation_uid: String(row.observation_uid ?? ""),
    sample_uid: String(row.sample_uid ?? ""),
    test_type: String(row.test_type ?? ""),
    exposure_duration_numeric: asNumber(row.exposure_duration_numeric),
    exposure_unit: asText(row.exposure_unit),
    efficiency_pct: asNumber(row.efficiency_pct),
    jsc_mA_cm2: asNumber(row.jsc_mA_cm2),
    voc_V: asNumber(row.voc_V),
    ff_pct: asNumber(row.ff_pct),
    outdoor_pr_pct: asNumber(row.outdoor_pr_pct),
    outdoor_pmpp_W: asNumber(row.outdoor_pmpp_W),
    outdoor_irradiance_W_m2: asNumber(row.outdoor_irradiance_W_m2),
    action_or_status: asText(row.action_or_status),
    comments: asText(row.comments),
    data_quality_flag: asText(row.data_quality_flag),
    source_row: asNumber(row.source_inventory_row),
  })).filter((row) => row.observation_uid && row.sample_uid);
}

function normalizeOutdoorDaily(rows: UnknownRow[]): Observation[] {
  return rows.map((row) => ({
    observation_uid: String(row.outdoor_daily_uid ?? ""),
    sample_uid: String(row.sample_uid ?? ""),
    test_type: "Outdoor",
    exposure_duration_numeric: asNumber(row.exposure_days),
    exposure_unit: "days",
    outdoor_pr_pct: asNumber(row.performance_ratio_pct_median),
    outdoor_pmpp_W: asNumber(row.pmpp_W_daylight_median ?? row.pmpp_W_max),
    outdoor_irradiance_W_m2: asNumber(row.irradiance_W_m2_daylight_median ?? row.irradiance_W_m2_max),
    action_or_status: "outdoor_daily_aggregate",
    comments: asText(row.aggregation_protocol),
    data_quality_flag: asText(row.qa_flags),
    source_file: asText(row.source_file),
    aggregation_protocol: asText(row.aggregation_protocol),
    raw_count: asNumber(row.raw_count),
    daylight_count: asNumber(row.daylight_count_irr_ge_200),
  })).filter((row) => row.observation_uid && row.sample_uid);
}

function normalizeFiles(rows: UnknownRow[]): IVFile[] {
  return rows.map((row) => ({
    file_uid: String(row.file_uid ?? ""),
    source_file: asText(row.source_file),
    inferred_test_type: asText(row.inferred_test_type),
    inferred_exposure_duration: asNumber(row.inferred_exposure_duration),
    inferred_exposure_unit: asText(row.inferred_exposure_unit),
    material_family_inferred: asText(row.material_family_inferred),
    measurement_date: asIsoDate(row.measurement_date),
    sample_uid: asText(row.sample_uid),
    match_status: String(row.match_status ?? "unmatched"),
    match_score: asNumber(row.match_score),
    match_margin: asNumber(row.match_margin),
    match_reasons: asText(row.match_reasons),
    matched_observation_uid: asText(row.matched_observation_uid),
  })).filter((row) => row.file_uid);
}

function normalizeMeasurements(rows: UnknownRow[]): Measurement[] {
  return rows.map((row) => ({
    measurement_uid: String(row.measurement_uid ?? ""),
    file_uid: String(row.file_uid ?? ""),
    sample_uid: asText(row.sample_uid),
    match_status: String(row.match_status ?? "unmatched"),
    sheet_name: asText(row.sheet_name),
    curve_series_index: asNumber(row.curve_series_index),
    measurement_date: asIsoDate(row.measurement_date),
    measurement_time: asText(row.measurement_time),
    cell_area_cm2: asNumber(row.cell_area_cm2),
    jsc_mA_cm2: asNumber(row.jsc_mA_cm2),
    voc_V: asNumber(row.voc_V),
    ff_pct: asNumber(row.ff_pct),
    efficiency_pct: asNumber(row.efficiency_pct),
    point_count: asNumber(row.point_count),
    qa_flags: asText(row.qa_flags),
  })).filter((row) => row.measurement_uid && row.file_uid);
}

async function parseCurves(tsv: File): Promise<Record<string, Curve>> {
  const curves: Record<string, Curve> = {};
  const reader = tsv.stream().pipeThrough(new TextDecoderStream()).getReader();
  let remainder = "";
  let headers: string[] | null = null;
  let uidIndex = -1;
  let voltageIndex = -1;
  let currentIndex = -1;

  const consume = (line: string) => {
    const clean = line.endsWith("\r") ? line.slice(0, -1) : line;
    if (!headers) {
      headers = clean.split("\t");
      uidIndex = headers.indexOf("measurement_uid");
      voltageIndex = headers.indexOf("voltage_V");
      currentIndex = headers.indexOf("generated_current_density_mA_cm2");
      if (uidIndex < 0 || voltageIndex < 0 || currentIndex < 0) {
        throw new Error("Required TSV columns are missing.");
      }
      return;
    }
    if (!clean) return;
    const cells = clean.split("\t");
    const uid = cells[uidIndex];
    if (!uid) return;
    const curve = curves[uid] ?? (curves[uid] = { v: [], j: [] });
    curve.v.push(asNumber(cells[voltageIndex]));
    curve.j.push(asNumber(cells[currentIndex]));
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    remainder += value;
    const lines = remainder.split("\n");
    remainder = lines.pop() ?? "";
    lines.forEach(consume);
  }
  if (remainder) consume(remainder);
  return curves;
}

export async function readNormalizedPair(workbookFile: File, pointsFile: File): Promise<IVDataset> {
  if (workbookFile.size > MAX_WORKBOOK_BYTES) throw new Error("The workbook is larger than the 32 MB safety limit.");
  if (pointsFile.size > MAX_POINTS_BYTES) throw new Error("The points file is larger than the 256 MB safety limit.");
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await workbookFile.arrayBuffer(), { type: "array", cellDates: true });
  const rows = (name: string): UnknownRow[] => {
    const sheet = workbook.Sheets[name];
    if (!sheet) throw new Error(`Sheet ${name} is missing from the workbook.`);
    return XLSX.utils.sheet_to_json<UnknownRow>(sheet, { defval: null, raw: true });
  };
  const optionalRows = (name: string): UnknownRow[] => {
    const sheet = workbook.Sheets[name];
    return sheet ? XLSX.utils.sheet_to_json<UnknownRow>(sheet, { defval: null, raw: true }) : [];
  };

  const samples = normalizeSamples(rows("Samples"));
  const recipes = normalizeRecipes(rows("Recipes"));
  const observations = [...normalizeObservations(rows("Inventory_Obs")), ...normalizeOutdoorDaily(optionalRows("Outdoor_Daily"))];
  const files = normalizeFiles(rows("IV_Files"));
  const measurements = normalizeMeasurements(rows("IV_Measurements"));
  const curves = await parseCurves(pointsFile);
  const points = Object.values(curves).reduce((total, curve) => total + curve.v.length, 0);

  return validateDataset({
    schemaVersion: "1.2",
    name: workbookFile.name.replace(/\.xlsx$/i, ""),
    generatedOn: new Date().toISOString().slice(0, 10),
    report: {
      samples: samples.length,
      recipes: recipes.length,
      observations: observations.length,
      files: files.length,
      measurements: measurements.length,
      points,
      matchedFiles: files.filter((file) => file.match_status.startsWith("matched_")).length,
      reviewFiles: files.filter((file) => file.match_status === "ambiguous" || file.match_status === "unmatched").length,
      auditFiles: files.filter((file) => file.match_status === "reference_unassigned" || file.match_status === "audit_only").length,
    },
    samples,
    recipes,
    observations,
    files,
    measurements,
    curves,
  });
}

export async function importDatasetFiles(files: File[]): Promise<IVDataset> {
  const pack = files.find((file) => /\.(ivpack|json|gz)$/i.test(file.name));
  if (pack && files.length === 1) return readPack(pack);
  const workbook = files.find((file) => /\.xlsx$/i.test(file.name));
  const points = files.find((file) => /\.tsv$/i.test(file.name));
  if (workbook && points) return readNormalizedPair(workbook, points);
  throw new Error("Select an .ivpack package, or select both the .xlsx workbook and the .tsv points file.");
}

export const METRICS: Record<MetricKey, { label: string; unit: string; digits: number }> = {
  efficiency_pct: { label: "Efficiency", unit: "%", digits: 2 },
  jsc_mA_cm2: { label: "Jsc", unit: "mA/cm²", digits: 2 },
  voc_V: { label: "Voc", unit: "V", digits: 3 },
  ff_pct: { label: "Fill factor", unit: "%", digits: 1 },
  outdoor_pr_pct: { label: "Outdoor PR (daily median)", unit: "%", digits: 1 },
  outdoor_pmpp_W: { label: "Outdoor Pmpp (daylight median)", unit: "W", digits: 2 },
  outdoor_irradiance_W_m2: { label: "Irradiance (daylight median)", unit: "W/m²", digits: 0 },
};

export { aggregate } from "./science";
