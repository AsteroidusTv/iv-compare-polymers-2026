import test from "node:test";
import assert from "node:assert/strict";
import { missingnessTable } from "../app/lib/missingness";
import { normalizationTraces } from "../app/lib/normalization-trace";
import type { IVDataset } from "../app/lib/iv-data";
const dataset = { observations: [
  {observation_uid:"A",sample_uid:"S1",test_type:"DH",exposure_duration_numeric:10,efficiency_pct:0},
  {observation_uid:"B",sample_uid:"S2",test_type:"DH",exposure_duration_numeric:20,efficiency_pct:10},
] } as IVDataset;
const traces = normalizationTraces(dataset,{ sampleUids:["S1","S2"],protocol:"DH",metric:"efficiency_pct",mode:"absolute",includeQa:false,outdoorWindow:7,qaIssues:new Map() });
test("zero is observed; absence is unknown, never zero or assumed failure",()=>{
  const rows = missingnessTable(traces,{protocol:"DH"});
  assert.equal(rows.find(r=>r.sampleUid==="S1"&&r.time===10)?.status,"observed");
  assert.equal(rows.find(r=>r.sampleUid==="S1"&&r.time===20)?.status,"unknown");
  assert.deepEqual(rows.find(r=>r.sampleUid==="S1"&&r.time===20)?.absoluteValues,[]);
});
test("sourced follow-up evidence and analytical exclusions remain distinct",()=>{
  const rows=missingnessTable(traces,{protocol:"DH", excludedSampleUids:["S2"], evidence:[{sampleUid:"S1",time:20,status:"followup_stopped",source:"synthetic log",reason:"explicit entry"}]});
  assert.equal(rows.find(r=>r.sampleUid==="S1"&&r.time===20)?.status,"followup_stopped");
  assert.deepEqual(rows.find(r=>r.sampleUid==="S2"&&r.time===20)?.exclusionReasons,["user_excluded"]);
});
