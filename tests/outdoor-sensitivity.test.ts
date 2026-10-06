import test from "node:test";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { outdoorSensitivity, outdoorFigureExclusions, type OutdoorRawRow } from "../app/lib/outdoor-sensitivity";
import { sourceQualityFlagApplies } from "../app/lib/source-quality";
import { outdoorQualityReason } from "../app/lib/science";
import { validateOutdoorBundle } from "../app/lib/outdoor-sensitivity-data";
test("Outdoor figure traces baseline and cutoff exclusions without treating hide as analytical exclusion",()=>{
 const day={time:10,value:5,qa:null};
 assert.deepEqual(outdoorFigureExclusions(day,null,"retention",5),["outside_graph_end","missing_baseline"]);
 assert.deepEqual(outdoorFigureExclusions(day,0,"retention",10),["zero_or_negative_baseline"]);
 assert.deepEqual(outdoorFigureExclusions(day,null,"absolute",10),[]);
 assert.deepEqual(outdoorFigureExclusions({...day,qa:"source_qa"},5,"absolute",10),["source_qa"]);
});
test("Outdoor thresholds recompute daily medians and B3/B7/B14 without optimizing a baseline",()=>{
 const rows:OutdoorRawRow[]=Array.from({length:14},(_,i)=>[100,200,300].map((irr,j)=>({sample_uid:"S",source_file:"raw.csv",source_row:i*3+j+2,measurement_date:`2026-01-${String(i+1).padStart(2,"0")}`,exposure_days:i,irradiance_W_m2:irr,performance_ratio_pct:50+i+j,pmpp_W:1+i/20+j/10}))).flat();
 const result=outdoorSensitivity(rows);
 assert.deepEqual([100,200,300].map(threshold=>result.summaries.find(row=>row.threshold===threshold)!.retainedRows),[42,28,14]);
 const pr=result.summaries.filter(row=>row.threshold===200&&row.metric==="pr");
 assert.deepEqual(pr.map(row=>row.baselineDays),[3,7,14]);
 assert.deepEqual(pr.map(row=>row.baseline),[52.5,54.5,58]);
 assert.equal(pr[1].differenceFromPrimaryPp,0);
 assert.equal(result.daily.find(row=>row.threshold===300)!.pr,52);
 const noIrr=outdoorSensitivity(rows.map(row=>({...row,irradiance_W_m2:null})));
 assert.ok(noIrr.summaries.every(row=>row.finalRetention===null&&row.validDays===0));
});
test("Outdoor metric flags do not contaminate another metric; unknown flags remain conservative",()=>{
 assert.equal(sourceQualityFlagApplies("pr_missing;pr_unavailable","outdoor_pmpp_W"),false);
 assert.equal(sourceQualityFlagApplies("outdoor_pr_adjudicated_fault","outdoor_pr_pct"),true);
 assert.equal(sourceQualityFlagApplies("outdoor_pr_adjudicated_fault","outdoor_pmpp_W"),false);
 assert.equal(sourceQualityFlagApplies("pr_missing","outdoor_pr_pct"),true);
 assert.equal(sourceQualityFlagApplies("irradiance_missing","outdoor_pmpp_W"),true);
 assert.equal(sourceQualityFlagApplies("unexplained_flag","outdoor_pmpp_W"),true);
 assert.equal(outdoorQualityReason({observation_uid:"o",sample_uid:"s",test_type:"Outdoor",outdoor_pmpp_W:1,data_quality_flag:"pr_missing"},"outdoor_pmpp_W",[]),null);
 const raw:OutdoorRawRow[]=Array.from({length:4},(_,i)=>({sample_uid:"s",source_file:"out.csv",source_row:i+2,measurement_date:`2026-01-0${i+1}`,exposure_days:i,irradiance_W_m2:250,performance_ratio_pct:null,pmpp_W:1+i/10,qa_flags:"pr_missing"}));
 const result=outdoorSensitivity(raw);
 assert.ok(result.summaries.filter(row=>row.metric==="pmpp"&&row.threshold===200).every(row=>row.validDays===4&&row.baseline!==null));
 assert.ok(result.summaries.filter(row=>row.metric==="pr").every(row=>row.validDays===0&&row.baseline===null));
 const duplicated=outdoorSensitivity([...raw,...raw.map(row=>({...row,source_file:"duplicate.csv"}))]);
 assert.ok(duplicated.summaries.every(row=>row.validDays===0));
});
test("owner-adjudicated Outdoor PR dates are omitted from PR and B7 but remain available for Pmpp",()=>{
 const excludedReason="Owner adjudicated this Outdoor PR daily aggregate as a measurement bug. Instrumental cause is unverified.";
 const rows:OutdoorRawRow[]=Array.from({length:14},(_,day)=>({sample_uid:"S",source_file:"raw.csv",source_row:day+2,measurement_date:`2026-04-${String(day+1).padStart(2,"0")}`,exposure_days:day,irradiance_W_m2:250,performance_ratio_pct:day===0?0:day===10?20:70+day,pmpp_W:day===0?0:1+day,qa_flags:day===0||day===10?"outdoor_pr_adjudicated_fault":null,qa_reason:day===0||day===10?excludedReason:null}));
 const result=outdoorSensitivity(rows);
 const pr=result.summaries.find(row=>row.threshold===200&&row.metric==="pr"&&row.window===7)!;
 const pmpp=result.summaries.find(row=>row.threshold===200&&row.metric==="pmpp"&&row.window===7)!;
 assert.equal(pr.validDays,12);
 assert.equal(pr.baseline,74);
 assert.equal(pr.daily.find(day=>day.date==="2026-04-01")!.value,null);
 assert.equal(pr.daily.find(day=>day.date==="2026-04-01")!.observedValue,0);
 assert.equal(pr.daily.find(day=>day.date==="2026-04-11")!.value,null);
 assert.equal(pr.daily.find(day=>day.date==="2026-04-01")!.qa,excludedReason);
 assert.equal(result.daily.find(day=>day.date==="2026-04-01")!.metricExcludedRows.pr[0].flag,"outdoor_pr_adjudicated_fault");
 assert.equal(pmpp.validDays,14);
 assert.equal(pmpp.daily.find(day=>day.date==="2026-04-01")!.value,0);
 assert.equal(pmpp.daily.find(day=>day.date==="2026-04-01")!.observedValue,0);
});
test("Outdoor supplemental data cannot be attached to a different pack",()=>{
 const bundle={schemaVersion:"outdoor-sensitivity-bundle/1",compatiblePackageHashes:["a".repeat(64)],provenance:{registrySha256:"b".repeat(64)},analysis:outdoorSensitivity([])};
 assert.equal(validateOutdoorBundle(bundle,"a".repeat(64)),bundle);
 assert.throws(()=>validateOutdoorBundle(bundle,"c".repeat(64)),/do not match/);
 assert.throws(()=>validateOutdoorBundle(bundle,null),/do not match/);
});

test("shipped Outdoor QA excludes isolated installation-day PR but preserves sustained low output",async()=>{
 const {readFile}=await import("node:fs/promises");
 const bundle=JSON.parse(gunzipSync(await readFile("public/data/outdoor-sensitivity-v1.ivpack")).toString());
 const series=(id:string)=>bundle.analysis.summaries.find((row:{sampleUid:string;metric:string;threshold:number;window:number})=>row.sampleUid===id&&row.metric==="pr"&&row.threshold===200&&row.window===7);
 for(const id of ["SMP-021","SMP-062","SMP-063","SMP-066","SMP-067"]){
  const day0=series(id).daily.find((day:{time:number})=>day.time===0);
  assert.match(day0.qa,/Installation-day dropout/);
  assert.ok(day0.observedValue!==null);
 }
 const sustained=series("SMP-048").daily.filter((day:{time:number})=>day.time<=7);
 assert.equal(sustained.length,8);
 assert.ok(sustained.every((day:{qa:string|null;value:number|null})=>day.qa===null&&day.value===0));
});

test("Outdoor loader requests a directly servable asset and decodes the shipped gzip bytes",async()=>{
 const {readFile}=await import("node:fs/promises");
 const {createHash}=await import("node:crypto");
 const {loadOutdoorBundle}=await import("../app/lib/outdoor-sensitivity-data");
 const previous=globalThis.fetch;
 const packageBytes=await readFile("public/data/iv-compare-dowsil.ivpack");
 const packageHash=createHash("sha256").update(packageBytes).digest("hex");
 globalThis.fetch=async(input)=>{
  assert.equal(input,"/data/outdoor-sensitivity-v1.ivpack");
  const bytes=await readFile(`public${input}`);
  return new Response(bytes);
 };
 try {
  const bundle=await loadOutdoorBundle(packageHash,new AbortController().signal);
  assert.ok(bundle.analysis.daily.length>0);
  assert.ok(bundle.analysis.summaries.length>0);
 } finally {globalThis.fetch=previous;}
});
