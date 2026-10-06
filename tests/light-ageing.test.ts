import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import XLSX from "xlsx";
import { loadLightAgeing, parsePearlSummary } from "../scripts/light-ageing.mjs";
import { normalizationTraces } from "../app/lib/normalization-trace";
import { fullSelectionCsv } from "../app/lib/figure-export";
import { metricOptionsFor } from "../app/lib/comparison";
import { validateDataset, type IVDataset, type Observation, type MetricKey } from "../app/lib/iv-data";

const forward = "light_pout_forward_mW_cm2", reverse = "light_pout_reverse_mW_cm2", combined = "light_pout_mean_mW_cm2";
const row = (id:string,time:number,f:number|null,r:number|null):Observation => ({observation_uid:id,sample_uid:"S1",test_type:"Light ageing",exposure_duration_numeric:time,[forward]:f,[reverse]:r});
const traces = (observations:Observation[],metric:MetricKey=forward) => normalizationTraces({observations} as IVDataset,{sampleUids:["S1"],protocol:"Light ageing",metric,mode:"retention",includeQa:false,outdoorWindow:7,qaIssues:new Map()});

test("light-ageing reproduces five raw summaries without duplicating TXT rows or changing Outdoor",async()=>{
 const bytes=await fs.readFile("public/data/iv-compare-dowsil.ivpack");
 const dataset=validateDataset(JSON.parse(gunzipSync(bytes).toString()));
 const light=await loadLightAgeing(process.cwd(),dataset.samples);
 const rows=dataset.observations.filter(r=>r.test_type==="Light ageing");
 assert.deepEqual(rows,light.observations);
 assert.equal(rows.length,1908);
 assert.equal(new Set(rows.map(r=>r.sample_uid)).size,5);
 assert.equal(new Set(rows.map(r=>dataset.samples.find(s=>s.sample_uid===r.sample_uid)!.material_family)).size,2);
 assert.ok(rows.every(r=>r.efficiency_pct===null&&r.exposure_unit==="h"));
 const manifest=JSON.parse(await fs.readFile("data/decisions/light-ageing-pearl-v1.json","utf8"));
 const hash=createHash("sha256").update(JSON.stringify(dataset.observations.filter(r=>r.test_type==="Outdoor"))).digest("hex");
 assert.equal(hash,manifest.previousOutdoorObservationsSha256);
 assert.deepEqual(metricOptionsFor("Light ageing").slice(0,3),[combined,forward,reverse]);
 assert.equal(metricOptionsFor("Light ageing").length,26);
});
test("light-ageing retention keeps the first recorded point and separates sweep directions",()=>{
 const observations=[{...row("U",0,99,99),test_type:"Unaged"},row("B",0.04,10,20),row("A",1,5,2),row("Z",2,0,0)];
 assert.deepEqual(traces(observations).map(t=>t.value),[100,50,0]);
 assert.deepEqual(traces(observations,reverse).map(t=>t.value),[100,10,0]);
 assert.equal(traces(observations)[1].baseline?.observations[0].observation_uid,"B");
});
test("light-ageing invalid initial reference never slides to a later point; QA is metric-local",()=>{
 for(const [initial,status] of [[null,"missing_baseline"],[0,"zero_baseline"],[-1,"negative_baseline"]] as const){
  const result=traces([row("B",0,initial,20),row("A",1,5,10)]);
  assert.equal(result[1].baseline?.status,status);assert.equal(result[1].value,null);
 }
 assert.equal(traces([row("B",0,10,20),row("B2",0,10,20),row("A",1,5,10)])[2].baseline?.status,"ambiguous_baseline");
 const flagged={...row("B",0,10,-1),data_quality_flag:`non_numeric_metric:${reverse}`};
 assert.equal(traces([flagged,row("A",1,5,10)])[1].value,50);
 assert.equal(traces([flagged,row("A",1,5,10)],reverse)[1].value,null);
});
test("light-ageing parser rejects ambiguous times and preserves worksheet row provenance",()=>{
 const entry={substrate:"A4-len1",cell:"C337",sample_uid:"S1",source:"test.xlsx"};
 const bytes=(times:(number|null)[])=>{
  const book=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([["Group","Len1","Len1"],["Substrate",entry.substrate,entry.substrate],["Cell",entry.cell,entry.cell],["Timestamp_C337","Pout_F_C337","Pout_R_C337"],...times.map(t=>t===null?[null,null,null]:[t,10,20])]),"Summary");
  return XLSX.write(book,{type:"buffer",bookType:"xlsx"});
 };
 assert.throws(()=>parsePearlSummary(bytes([0,0]),entry),/duplicated/);
 assert.throws(()=>parsePearlSummary(bytes([1,0]),entry),/unordered/);
 assert.deepEqual(parsePearlSummary(bytes([0,null,1]),entry).map((r:Observation)=>r.source_row),[5,7]);
});
test("owner-confirmed different irradiation is excluded in both modes even with QA enabled",()=>{
 const observations=[{...row("H",0,15,30),data_quality_flag:"light_irradiance_changed"},row("B",1,10,20),row("A",2,8,10)];
 for(const mode of ["absolute","retention"] as const)for(const metric of [forward,reverse,combined] as const){
  const result=normalizationTraces({observations} as IVDataset,{sampleUids:["S1"],protocol:"Light ageing",metric,mode,includeQa:true,outdoorWindow:7,qaIssues:new Map()});
  assert.equal(result[0].value,null);assert.ok(result[0].exclusions.includes("different_irradiance"));
  assert.equal(result[1].value,mode==="retention"?100:metric===forward?10:metric===reverse?20:15);
  if(mode==="retention")assert.equal(result[1].baseline?.observations[0].observation_uid,"B");
 }
});
test("all five light-ageing cells omit reviewed 1.5-sun peaks and recovery transitions, keeping row 7 as reference",async()=>{
 const dataset=validateDataset(JSON.parse(gunzipSync(await fs.readFile("public/data/iv-compare-dowsil.ivpack")).toString()));
 const observations=dataset.observations.filter(row=>row.test_type==="Light ageing");
 const sampleUids=[...new Set(observations.map(row=>row.sample_uid))];
 for(const metric of [forward,reverse,combined] as const){
  const result=normalizationTraces(dataset,{sampleUids,protocol:"Light ageing",metric,mode:"retention",includeQa:true,outdoorWindow:7,qaIssues:new Map()});
  const excluded=result.filter(t=>t.exclusions.includes("different_irradiance"));
  assert.equal(excluded.length,30);assert.equal(result.filter(t=>t.value!==null).length,1878);
  assert.ok(excluded.every(t=>[5,6,84,85,86,87].includes(t.observation.source_row!)));
  assert.ok(result.filter(t=>[83,88].includes(t.observation.source_row!)).every(t=>t.value!==null));
  assert.ok(result.every(t=>t.baseline?.observations[0].source_row===7));
  assert.ok(result.filter(t=>t.observation.source_row===7).every(t=>t.value===100));
 }
});
test("paired light-ageing mean combines powers before retention and preserves source readings",()=>{
 const observations=[row("B",0,10,20),row("A",1,5,2),row("Z",2,0,0)];
 const original=JSON.stringify(observations);
 const result=traces(observations,combined);
 assert.deepEqual(result.map(t=>t.absoluteValue),[15,3.5,0]);
 assert.equal(result[1].value,100*3.5/15);
 assert.notEqual(result[1].value,(50+10)/2);
 assert.equal(result[2].value,0);
 assert.equal(result[1].observation.light_pout_forward_mW_cm2,5);
 assert.equal(result[1].observation.light_pout_reverse_mW_cm2,2);
 assert.match(result[1].observation.aggregation_protocol!,/same light-ageing source row/);
 const exported=fullSelectionCsv({analysisTrace:{a:result}});
 assert.ok(exported.includes("light_pout_forward_mW_cm2"));
 assert.ok(exported.includes("light_pout_reverse_mW_cm2"));
 assert.ok(exported.includes("light_pout_mean_mW_cm2"));
 assert.ok(exported.includes("same light-ageing source row"));
 assert.equal(JSON.stringify(observations),original);
});
test("paired light-ageing mean requires both readings and never substitutes a later baseline",()=>{
 for(const value of [null,-1,NaN,Infinity]){
  const result=traces([row("B",0,10,value),row("A",1,5,10)],combined);
  assert.equal(result[0].absoluteValue,null);
  assert.equal(result[1].baseline?.status,"missing_baseline");
  assert.equal(result[1].value,null);
 }
 const result=traces([row("B",0,10,20),row("A",1,null,10)],combined);
 assert.equal(result[1].value,null);
 assert.ok(result[1].exclusions.includes("non_numeric_metric"));
});
test("paired light-ageing mean inherits QA from either direction",()=>{
 for(const direction of [forward,reverse]){
  const observations=[row("B",0,10,20),{...row("A",1,5,10),data_quality_flag:`non_numeric_metric:${direction}`}];
  const result=traces(observations,combined);
  assert.equal(result[1].value,null);
  assert.ok(result[1].exclusions.includes("qa_metric"));
 }
});
