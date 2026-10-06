import type { IVDataset } from "./iv-data";
import { labQualityIssues } from "./lab-quality";
import { normalizationTraces } from "./normalization-trace";
import { numeric } from "./science";

export const SYNCHRONIZED_METRICS = ["efficiency_pct", "jsc_mA_cm2", "voc_V", "ff_pct"] as const;
/** Shared specimen/time grid. A missing metric creates a cell, not a smaller silent cohort. */
export function synchronizedMetrics(dataset: IVDataset, options: { sampleUids: string[]; protocol: "DH" | "TC"; graphEnd: number | null; excludedSampleUids?: string[] }) {
  const selectedSamples=dataset.samples.filter(sample=>options.sampleUids.includes(sample.sample_uid));
  const allTimes=[...new Set(dataset.observations.filter(row=>options.sampleUids.includes(row.sample_uid)&&row.test_type===options.protocol&&numeric(row.exposure_duration_numeric)).map(row=>row.exposure_duration_numeric!))].sort((a,b)=>a-b);
  const times=allTimes.filter(time=>options.graphEnd===null||time<=options.graphEnd);
  const excluded=new Set(options.excludedSampleUids??[]);
  const cohort=selectedSamples.filter(sample=>!excluded.has(sample.sample_uid)).map(sample=>sample.sample_uid);
  const panels=SYNCHRONIZED_METRICS.map(metric=>{
    const traces=normalizationTraces(dataset,{sampleUids:options.sampleUids,protocol:options.protocol,metric,mode:"retention",includeQa:false,outdoorWindow:7,qaIssues:labQualityIssues(dataset.observations,metric)});
    const cells=cohort.flatMap(sampleUid=>times.map(time=>{
      const rows=traces.filter(trace=>trace.observation.sample_uid===sampleUid&&trace.observation.exposure_duration_numeric===time);
      return {sampleUid,time,value:rows.length===1?rows[0].value:null,trace:rows[0]??null,reasons:rows.length===0?["missing_at_exact_time"]:rows.length>1?["ambiguous_duplicate_observation"]:rows[0].exclusions};
    }));
    return {metric,sampleUids:cohort,times,cells,traces,counts:times.map(time=>({time,selectedN:cohort.length,observedN:cells.filter(cell=>cell.time===time&&cell.value!==null).length}))};
  });
  return {version:"synchronized-metrics/1",protocol:options.protocol,unit:options.protocol==="DH"?"h":"cycles",selectedSamples,cohort,times,allTimes,graphEnd:options.graphEnd,excludedSampleUids:[...excluded],panels,
    policy:{aggregation:"individual trajectories only",qa:"same metric-specific rules in each panel",normalization:"100 * value / same specimen unique Unaged baseline",missingness:"shared specimen/time grid with explicit missing values; gaps never joined",interpolation:"none"}};
}
