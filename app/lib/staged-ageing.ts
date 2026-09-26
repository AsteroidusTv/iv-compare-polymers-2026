import type { IVDataset, Observation, Sample } from "./iv-data";
import { labQualityIssues } from "./lab-quality";
import { numeric } from "./science";
import { analysisGroups } from "./cohort";
import { recordedRibbon, ribbonLabel } from "./ribbon";

export type AgedTime = { mode: "exact"; time: number } | { mode: "last-common" };
export interface StageValue { value: number | null; reasons: string[]; observations: Observation[] }
export interface StagedDisplayGroup { key:string; label:string; materialFamily:string; sampleUids:string[]; sourceGroupKeys:string[] }

/** No nearest time, interpolation, or per-specimen last value is ever substituted. */
export function stagedAgeing(dataset: IVDataset, options: { sampleUids: string[]; protocol: "DH" | "TC"; aged: AgedTime; excludedSampleUids?: string[]; groupUnknownMetadata?: boolean; splitByRibbon?: boolean }) {
  const samples = dataset.samples.filter(sample => options.sampleUids.includes(sample.sample_uid));
  const qa = labQualityIssues(dataset.observations, "efficiency_pct");
  const stage = (rows: Observation[]): StageValue => {
    const reasons = rows.length !== 1 ? [rows.length ? "ambiguous_observations" : "missing_measurement"] : [];
    if (rows.length === 1 && !numeric(rows[0].efficiency_pct)) reasons.push("non_numeric_metric");
    if (rows.some(row => qa.has(row.observation_uid))) reasons.push("qa_metric");
    return { value: reasons.length ? null : rows[0].efficiency_pct!, reasons, observations: rows };
  };
  const excluded = new Set(options.excludedSampleUids ?? []);
  const times = [...new Set(dataset.observations.filter(row => options.sampleUids.includes(row.sample_uid) && row.test_type === options.protocol && numeric(row.exposure_duration_numeric)).map(row => row.exposure_duration_numeric!))].sort((a,b)=>a-b);
  const cohort = samples.filter(sample => !excluded.has(sample.sample_uid));
  const atTime = (sampleUid: string, time: number) => stage(dataset.observations.filter(row => row.sample_uid === sampleUid && row.test_type === options.protocol && row.exposure_duration_numeric === time));
  const commonTimes = cohort.length ? times.filter(time => cohort.every(sample => atTime(sample.sample_uid,time).value !== null)) : [];
  const time = options.aged.mode === "exact" ? Number.isFinite(options.aged.time) && options.aged.time >= 0 ? options.aged.time : null : commonTimes.at(-1) ?? null;
  const groups = analysisGroups(samples, "conservative", options.groupUnknownMetadata, options.splitByRibbon);
  const rows = samples.map(sample => {
    const before: StageValue = { value: numeric(sample.initial_efficiency_pct) && sample.initial_efficiency_pct >= 0 && sample.initial_efficiency_pct <= 50 ? sample.initial_efficiency_pct : null, reasons: [], observations: [] };
    if (before.value === null) before.reasons.push(numeric(sample.initial_efficiency_pct) ? "qa_initial_pce" : "missing_initial_pce");
    const post = stage(dataset.observations.filter(row => row.sample_uid === sample.sample_uid && row.test_type === "Unaged"));
    const aged = time === null ? {value:null,reasons:["no_common_time"],observations:[]} : atTime(sample.sample_uid,time);
    if (aged.reasons.includes("missing_measurement")) aged.reasons = ["missing_at_exact_time"];
    const retentionReasons = [...aged.reasons, ...post.reasons];
    if (post.value === 0) retentionReasons.push("zero_baseline");
    const retention = aged.value !== null && post.value !== null && post.value > 0 ? 100 * aged.value / post.value : null;
    return { sampleUid: sample.sample_uid, sample, groupKey: groups.find(group => group.samples.some(item => item.sample_uid === sample.sample_uid))!.key,
      excluded: excluded.has(sample.sample_uid), exclusionReasons: excluded.has(sample.sample_uid) ? ["user_excluded"] : [], before, post, aged, retention, retentionReasons,
      rawObservations: dataset.observations.filter(row => row.sample_uid === sample.sample_uid && (row.test_type === "Unaged" || row.test_type === options.protocol)) };
  });
  return { version:"staged-ageing/1", protocol:options.protocol, unit:options.protocol === "DH" ? "h" : "cycles", timeMode:options.aged.mode,
    time, availableTimes:times, commonTimes, rows, groups:groups.map(group=>({key:group.key,label:group.label,sampleUids:group.samples.map(sample=>sample.sample_uid)})),
    counts: Object.fromEntries((["before","post","aged"] as const).map(key=>[key,rows.filter(row=>!row.excluded && row[key].value!==null).length])),
    policy:{qa:"metric-local source flags and laboratory review heuristics excluded",missingIsZero:false,interpolation:"none",timeSelection:"one exact time for all specimens",retention:"100 * aged / post; never post / before"} };
}

export function stagedDisplayGroups(
  groups: Array<{key:string;label:string;sampleUids:string[]}>,
  samples: Sample[],
  hiddenGroupKeys: string[],
  excludedSampleUids: string[],
  aggregateAcrossBatches: boolean,
  splitByRibbon = false,
): StagedDisplayGroup[] {
  const sampleByUid = new Map(samples.map(sample => [sample.sample_uid, sample]));
  const hidden = new Set(hiddenGroupKeys), excluded = new Set(excludedSampleUids);
  const output = new Map<string, {label:string;materialFamily:string;sampleUids:Set<string>;sourceGroupKeys:Set<string>}>();
  for (const group of groups) {
    if (hidden.has(group.key)) continue;
    const memberUids = group.sampleUids.filter(uid => !excluded.has(uid));
    if (!memberUids.length) continue;
    const materialFamily = sampleByUid.get(memberUids[0])?.material_family;
    if (!materialFamily) continue;
    const ribbon = recordedRibbon(sampleByUid.get(memberUids[0])!);
    const key = aggregateAcrossBatches ? splitByRibbon ? JSON.stringify(["material", materialFamily, ribbon]) : `material:${materialFamily}` : group.key;
    const display = output.get(key) ?? {
      label:aggregateAcrossBatches ? `${materialFamily}${splitByRibbon ? ` · ${ribbonLabel(ribbon)}` : ""}` : group.label,
      materialFamily,
      sampleUids:new Set<string>(),
      sourceGroupKeys:new Set<string>(),
    };
    memberUids.forEach(uid => display.sampleUids.add(uid));
    display.sourceGroupKeys.add(group.key);
    output.set(key, display);
  }
  return [...output].map(([key,group])=>({
    key,label:group.label,materialFamily:group.materialFamily,
    sampleUids:[...group.sampleUids],sourceGroupKeys:[...group.sourceGroupKeys],
  }));
}
