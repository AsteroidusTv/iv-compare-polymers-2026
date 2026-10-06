import { median, numeric, outdoorBaseline, outdoorQualityReason } from "./science";
import type { Observation } from "./iv-data";
import { sourceQualityFlagApplies } from "./source-quality";
export interface OutdoorRawRow {sample_uid:string;source_file:string;source_row:number;measurement_date:string;exposure_days:number;irradiance_W_m2:number|null;performance_ratio_pct:number|null;pmpp_W:number|null;qa_flags?:string|null;qa_reason?:string|null}
export const OUTDOOR_THRESHOLDS=[100,200,300] as const;
export function outdoorFigureExclusions(day: { qa: string | null; time: number; value: number | null }, baseline: number | null, mode: "absolute" | "retention", end: number): string[] {
 const reasons: string[] = [];
 if(day.qa) reasons.push(day.qa);
 if(day.value === null) reasons.push("non_numeric_metric");
 if(day.time > end) reasons.push("outside_graph_end");
 if(mode === "retention") {
  if(baseline === null) reasons.push("missing_baseline");
  else if(baseline <= 0) reasons.push("zero_or_negative_baseline");
 }
 return [...new Set(reasons)];
}
export function outdoorSensitivity(raw:OutdoorRawRow[]) {
 const groups=new Map<string,OutdoorRawRow[]>();
 for(const row of raw){const key=JSON.stringify([row.sample_uid,row.source_file,row.measurement_date]);const list=groups.get(key)??[];list.push(row);groups.set(key,list);}
 const daily=OUTDOOR_THRESHOLDS.flatMap(threshold=>[...groups.values()].map(rows=>{
  const kept=rows.filter(row=>row.irradiance_W_m2!==null&&row.irradiance_W_m2>=threshold);
  const mid=(values:(number|null)[])=>{const valid=values.filter(numeric);return valid.length?median(valid):null;};
  return {threshold,sampleUid:rows[0].sample_uid,source:rows[0].source_file,date:rows[0].measurement_date,time:rows[0].exposure_days,rawCount:rows.length,retainedRows:kept.length,
   retainedSourceRows:kept.map(row=>row.source_row),
   metricExcludedRows:{pr:kept.filter(row=>sourceQualityFlagApplies(row.qa_flags,"outdoor_pr_pct")||row.performance_ratio_pct===null).map(row=>({sourceRow:row.source_row,flag:row.qa_flags??null,reason:row.qa_reason??row.qa_flags??"non_numeric_metric:pr"})),pmpp:kept.filter(row=>sourceQualityFlagApplies(row.qa_flags,"outdoor_pmpp_W")||row.pmpp_W===null||row.pmpp_W<0).map(row=>({sourceRow:row.source_row,flag:row.qa_flags??null,reason:row.qa_reason??row.qa_flags??"non_numeric_or_negative_pmpp"}))},
   pr:mid(kept.filter(row=>!sourceQualityFlagApplies(row.qa_flags,"outdoor_pr_pct")).map(row=>row.performance_ratio_pct)),prObserved:mid(kept.map(row=>row.performance_ratio_pct)),
   pmpp:mid(kept.filter(row=>!sourceQualityFlagApplies(row.qa_flags,"outdoor_pmpp_W")).map(row=>row.pmpp_W!==null&&row.pmpp_W>=0?row.pmpp_W:null)),pmppObserved:mid(kept.map(row=>row.pmpp_W)),irradiance:mid(kept.map(row=>row.irradiance_W_m2)),
   reason:rows.every(row=>row.irradiance_W_m2===null)?"irradiance_missing":kept.length?null:"no_rows_at_threshold"};
 })).sort((a,b)=>a.sampleUid.localeCompare(b.sampleUid)||a.threshold-b.threshold||a.time-b.time||a.source.localeCompare(b.source));
 const summaries=[...new Set(raw.map(row=>row.sample_uid))].sort().flatMap(sampleUid=>OUTDOOR_THRESHOLDS.flatMap(threshold=>(["pr","pmpp"] as const).flatMap(metric=>{
  const rows=daily.filter(row=>row.sampleUid===sampleUid&&row.threshold===threshold);
  const metricKey=metric==="pr"?"outdoor_pr_pct":"outdoor_pmpp_W";
  const peers=rows.flatMap(row=>row[metric]===null?[]:[{time:row.time,value:row[metric]!}]);
  const reviewed=rows.map(row=>{
   const observation:Observation={observation_uid:`${sampleUid}:${threshold}:${row.date}`,sample_uid:sampleUid,test_type:"Outdoor",exposure_duration_numeric:row.time,[metricKey]:row[metric]};
   const adjudicationReason=metric==="pr"?row.metricExcludedRows.pr.find(excluded=>excluded.flag?.split(/[;,|]/).includes("outdoor_pr_adjudicated_fault"))?.reason:null;
   return {...row,qa:row.reason??adjudicationReason??(rows.filter(peer=>peer.date===row.date).length>1?"ambiguous_duplicate_day":null)??(row[metric]===null?"non_numeric_metric":outdoorQualityReason(observation,metricKey,peers)),observedValue:metric==="pr"?row.prObserved:row.pmppObserved};
  });
  const valid=reviewed.filter(row=>row[metric]!==null&&!row.qa);
  return ([3,7,14] as const).map(window=>{
   const baseline=outdoorBaseline(valid.map(row=>row[metric]!),window),last=valid.at(-1);
   const finalRetention=baseline.value!==null&&baseline.value>0&&last?100*last[metric]!/baseline.value:null;
   return {sampleUid,threshold,metric,window,rawCount:rows.reduce((n,row)=>n+row.rawCount,0),retainedRows:rows.reduce((n,row)=>n+row.retainedRows,0),validDays:valid.length,baseline:baseline.value,baselineDays:baseline.count,baselineDates:valid.slice(0,window).map(row=>row.date),lastDate:last?.date??null,lastTime:last?.time??null,lastValue:last?.[metric]??null,finalRetention,baselineSensitivityPct:baseline.sensitivityPct,
    daily:reviewed.map(row=>({source:row.source,date:row.date,time:row.time,retainedRows:row.retainedRows,qa:row.qa,value:row[metric],observedValue:row.observedValue,retention:row.qa||row[metric]===null||baseline.value===null||baseline.value<=0?null:100*row[metric]!/baseline.value})),differenceFromPrimaryPp:null as number|null};
  });
 })));
 for(const row of summaries){const main=summaries.find(item=>item.sampleUid===row.sampleUid&&item.metric===row.metric&&item.threshold===200&&item.window===7);row.differenceFromPrimaryPp=row.finalRetention!==null&&main?.finalRetention!==null&&main?.finalRetention!==undefined?row.finalRetention-main.finalRetention:null;}
 return {schemaVersion:"outdoor-sensitivity/1",primary:{threshold:200,window:7},rows:raw.length,daily,summaries,policy:{daylight:"irradiance >= threshold",daily:"median, no interpolation",baseline:"first up to N QA-valid daily values, minimum 3",electricalOnly:"unavailable for irradiance-threshold sensitivity",finalComparison:"last QA-valid value of each scenario; dates explicitly reported",prDefinition:"instrumental definition unresolved"}};
}
