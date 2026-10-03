import type { IVDataset, IVFile, Measurement } from "./iv-data";
import type { SeriesConfig } from "./comparison";
import { seriesSamplePasses } from "./comparison";
import { getJVDiagnostics } from "./jv-science";
import { measurementQualityReasons, numeric } from "./science";

export interface AgeingTimeCandidate {
  time: number;
  files: IVFile[];
  measurements: Measurement[];
}

export interface AgeingSampleCandidate {
  sampleUid: string;
  label: string;
  times: AgeingTimeCandidate[];
}

export function ageingSampleCandidates(dataset: IVDataset, config: SeriesConfig, includeQa: boolean, inspectUnsafe = false): AgeingSampleCandidate[] {
  const diagnostics = getJVDiagnostics(dataset);
  const sampleMap = new Map(dataset.samples.map((sample) => [sample.sample_uid, sample]));
  const measurementsByFile = new Map<string, Measurement[]>();
  for (const measurement of dataset.measurements) {
    if (!measurement.sample_uid || !dataset.curves[measurement.measurement_uid]) continue;
    if (!includeQa && measurementQualityReasons(measurement).length) continue;
    if (!inspectUnsafe && !diagnostics.get(measurement.measurement_uid)?.screeningEligible) continue;
    const rows = measurementsByFile.get(measurement.file_uid) ?? [];
    rows.push(measurement);
    measurementsByFile.set(measurement.file_uid, rows);
  }
  const grouped = new Map<string, Map<number, { files: IVFile[]; measurements: Measurement[] }>>();
  for (const file of dataset.files) {
    if (!file.match_status.startsWith("matched_") || !file.sample_uid) continue;
    const sample = sampleMap.get(file.sample_uid);
    if (!sample || sample.material_family !== config.material) continue;
    if (!seriesSamplePasses(dataset, sample.sample_uid, config)) continue;
    const time = file.inferred_test_type === "Unaged" ? 0 : file.inferred_test_type === config.stress ? file.inferred_exposure_duration : null;
    if (!numeric(time)) continue;
    const measurements = (measurementsByFile.get(file.file_uid) ?? []).filter((measurement) => measurement.sample_uid === file.sample_uid);
    if (!measurements.length) continue;
    const byTime = grouped.get(file.sample_uid) ?? new Map();
    const entry = byTime.get(time) ?? { files: [], measurements: [] };
    entry.files.push(file);
    entry.measurements.push(...measurements);
    byTime.set(time, entry);
    grouped.set(file.sample_uid, byTime);
  }
  return [...grouped].flatMap(([sampleUid, byTime]) => {
    if (byTime.size < 2) return [];
    const sample = sampleMap.get(sampleUid);
    return [{
      sampleUid,
      label: sample?.sample_label || sample?.sample_id_raw || sampleUid,
      times: [...byTime].map(([time, value]) => ({ time, ...value })).sort((a, b) => a.time - b.time),
    }];
  }).sort((a, b) => a.label.localeCompare(b.label, "en", { numeric: true }) || a.sampleUid.localeCompare(b.sampleUid));
}

export function defaultAgeingTimes(times: number[]): number[] {
  if (times.length <= 2) return [...times];
  return [times[0], times[times.length - 1]];
}

export function resolveAgeingTimes(available: number[], requested: number[]): number[] {
  const valid = requested.filter((time, index) => available.includes(time) && requested.indexOf(time) === index).sort((a, b) => a - b);
  return valid.length >= 2 ? valid : defaultAgeingTimes(available);
}

export function toggleAgeingTime(selected: number[], time: number): number[] {
  if (selected.includes(time)) return selected.length <= 2 ? selected : selected.filter((item) => item !== time);
  return [...selected, time].sort((a, b) => a - b);
}
