import test from "node:test";
import assert from "node:assert/strict";
import type { IVDataset, Observation } from "../app/lib/iv-data";
import { normalizationTraces } from "../app/lib/normalization-trace";
const row = (id:string, type:string, value:number|null): Observation => ({observation_uid:id, sample_uid:"S1", test_type:type, exposure_duration_numeric:10, efficiency_pct:value});
const trace = (rows:Observation[]) => normalizationTraces({observations:rows} as IVDataset, {sampleUids:["S1"], protocol:"DH", metric:"efficiency_pct", mode:"retention", includeQa:false, outdoorWindow:7, qaIssues:new Map()});
test("relative point carries original, baseline and formula; measured zero is retained", () => {
  const result = trace([row("B","Unaged",10),row("A","DH",5),{...row("Z","DH",0),exposure_duration_numeric:20}]);
  assert.equal(result[0].value,50); assert.equal(result[0].absoluteValue,5);
  assert.equal(result[0].baseline?.observations[0].observation_uid,"B");
  assert.equal(result[1].value,0); assert.deepEqual(result[1].exclusions,[]);
});
test("duplicate specimen/time observations are explicit ambiguity, not extra specimens", () => {
  const result = trace([row("B","Unaged",10),row("A","DH",5),row("A2","DH",8)]);
  assert.ok(result.every(point=>point.value===null && point.exclusions.includes("ambiguous_duplicate_observation")));
});
test("missing, zero and ambiguous references never silently produce retention", () => {
  assert.deepEqual(trace([row("A","DH",5)])[0].exclusions,["missing_baseline"]);
  assert.deepEqual(trace([row("B","Unaged",0),row("A","DH",5)])[0].exclusions,["zero_baseline"]);
  assert.deepEqual(trace([row("B","Unaged",10),row("B2","Unaged",20),row("A","DH",5)])[0].exclusions,["ambiguous_baseline"]);
});
test("Outdoor adjudicated PR stays inspectable, is excluded by default, and can be included explicitly",()=>{
  const rows=[0,20,30,40].map((value,index)=>({
    ...row(`O${index}`,"Outdoor",value),exposure_duration_numeric:index,
    ...(index===0?{data_quality_flag:"outdoor_pr_adjudicated_fault"}:{}),
    outdoor_pr_pct:value,
  }));
  const run=(includeQa:boolean)=>normalizationTraces({observations:rows} as IVDataset,{sampleUids:["S1"],protocol:"Outdoor",metric:"outdoor_pr_pct",mode:"retention",includeQa,outdoorWindow:7,qaIssues:new Map()});
  const excluded=run(false),included=run(true);
  assert.equal(excluded[0].absoluteValue,0);
  assert.equal(excluded[0].value,null);
  assert.ok(excluded[0].exclusions.includes("qa_metric"));
  assert.deepEqual(excluded[0].baseline?.observations.map(item=>item.observation_uid),["O1","O2","O3"]);
  assert.equal(included[0].value,0);
});
