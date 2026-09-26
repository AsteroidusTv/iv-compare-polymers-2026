import type { Aggregation, Sample } from "./iv-data";
import { numeric, summarise } from "./science";
import { recordedRibbon, ribbonLabel } from "./ribbon";

export type AnalysisGrouping = "conservative" | "material" | "formulation" | "batch" | "recipe" | "electrode";
export interface AnalysisGroup { key: string; label: string; samples: Sample[] }

export function analysisGroups(samples: Sample[], mode: AnalysisGrouping = "conservative", groupUnknownMetadata = false, splitByRibbon = false): AnalysisGroup[] {
  const groups = new Map<string, AnalysisGroup>();
  for (const sample of samples) {
    const fields = { material: sample.material_family, formulation: sample.material_raw ?? null, batch: sample.batch_no_raw ?? null, recipe: sample.recipe_uid ?? sample.recipe_raw ?? null, electrode: sample.electrode ?? null };
    const levels = mode === "conservative" ? ["formulation", "batch", "recipe", "electrode"] as const : mode === "material" ? [] : [mode];
    const ribbon = recordedRibbon(sample);
    const values = [fields.material, ...levels.map((level) => fields[level]), ...(splitByRibbon ? [ribbon] : [])];
    // Missing provenance is not evidence of compatibility: conservative mode
    // keeps incompletely documented specimens separate unless descriptive
    // pooling is explicitly requested within a known formulation and batch.
    const uncertain = mode === "conservative" && values.some((value) => value === null)
      && (!groupUnknownMetadata || fields.formulation === null || fields.batch === null);
    const key = JSON.stringify([...values, ...(uncertain ? [sample.sample_uid] : [])]);
    const label = [fields.material, ...levels.map((level) => `${level}: ${fields[level] ?? "unknown"}`), ...(splitByRibbon ? [ribbonLabel(ribbon)] : []), ...(uncertain ? [sample.sample_uid] : [])].join(" · ");
    const group = groups.get(key) ?? { key, label, samples: [] };
    group.samples.push(sample);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export interface CohortValue { time: number; sampleUid: string; value: number; batch?: string | null }
export interface CohortWindow { start: number; end: number }

function validRows(rows: CohortValue[]): CohortValue[] {
  const valid = rows.filter((row) => numeric(row.time) && numeric(row.value));
  const keys = new Set<string>();
  for (const row of valid) {
    const key = JSON.stringify([row.time, row.sampleUid]);
    if (keys.has(key)) throw new Error(`Ambiguous duplicate observation for ${row.sampleUid} at ${row.time}.`);
    keys.add(key);
  }
  return valid;
}

export function constantCohort(rows: CohortValue[], window: CohortWindow): { sampleUids: string[]; excludedSampleUids: string[]; times: number[] } {
  if (!numeric(window.start) || !numeric(window.end) || window.start > window.end) throw new Error("Invalid cohort window.");
  const selected = validRows(rows).filter((row) => row.time >= window.start && row.time <= window.end);
  const times = [...new Set(selected.map((row) => row.time))].sort((a, b) => a - b);
  const all = [...new Set(selected.map((row) => row.sampleUid))].sort();
  const sampleUids = all.filter((id) => times.every((time) => selected.some((row) => row.sampleUid === id && row.time === time)));
  return { sampleUids, excludedSampleUids: all.filter((id) => !sampleUids.includes(id)), times };
}

export function cohortTimeline(rows: CohortValue[], method: Aggregation = "median") {
  const valid = validRows(rows);
  const times = [...new Set(valid.map((row) => row.time))].sort((a, b) => a - b);
  let previous: CohortValue[] = [];
  return times.map((time) => {
    const current = valid.filter((row) => row.time === time);
    const sampleUids = current.map((row) => row.sampleUid).sort();
    const entered = sampleUids.filter((id) => !previous.some((row) => row.sampleUid === id));
    const left = previous.filter((row) => !sampleUids.includes(row.sampleUid)).map((row) => row.sampleUid).sort();
    const summary = summarise(current.map((row) => row.value), method);
    const old = previous.length ? summarise(previous.map((row) => row.value), method) : null;
    const retained = previous.filter((row) => sampleUids.includes(row.sampleUid));
    const outgoing = previous.filter((row) => left.includes(row.sampleUid));
    const apparentRecoveryRisk = Boolean(old && summary.value > old.value && retained.length && outgoing.length
      && summarise(outgoing.map((row) => row.value), "mean").value < summarise(retained.map((row) => row.value), "mean").value);
    const result = { time, n: sampleUids.length, sampleUids, batches: [...new Set(current.map((row) => row.batch ?? "unknown"))].sort(), entered, left, compositionChanged: previous.length > 0 && (entered.length > 0 || left.length > 0), apparentRecoveryRisk, summary };
    previous = current;
    return result;
  });
}

export type MissingnessStatus = "observed" | "qa_excluded" | "missing_measurement" | "unknown";
export function missingnessStatus(input: { observationExists: boolean; numericValue: boolean; qaExcluded: boolean; measurementExpected?: boolean }): MissingnessStatus {
  if (input.observationExists && input.qaExcluded) return "qa_excluded";
  if (input.observationExists && input.numericValue) return "observed";
  return input.measurementExpected ? "missing_measurement" : "unknown";
}

export function laboratoryRetention(value: number, baseline: number | null | undefined): number | null {
  return numeric(value) && numeric(baseline) && baseline > 0 ? 100 * value / baseline : null;
}

export function baselineDiagnostic(value: number | null | undefined, lowThreshold?: number): "missing" | "zero" | "negative" | "low" | "valid" {
  if (!numeric(value)) return "missing";
  if (value === 0) return "zero";
  if (value < 0) return "negative";
  return lowThreshold !== undefined && value < lowThreshold ? "low" : "valid";
}
