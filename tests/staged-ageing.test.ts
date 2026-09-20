import test from "node:test";
import assert from "node:assert/strict";
import type { IVDataset } from "../app/lib/iv-data";
import { stagedAgeing } from "../app/lib/staged-ageing";
const dataset={samples:[{sample_uid:"a",material_family:"EVA",initial_efficiency_pct:12},{sample_uid:"b",material_family:"EVA",initial_efficiency_pct:10}],observations:[
  {sample_uid:"a",observation_uid:"pa",test_type:"Unaged",efficiency_pct:10},
  {sample_uid:"b",observation_uid:"pb",test_type:"Unaged",efficiency_pct:8},
  {sample_uid:"a",observation_uid:"a1",test_type:"DH",exposure_duration_numeric:100,efficiency_pct:9},
  {sample_uid:"b",observation_uid:"b1",test_type:"DH",exposure_duration_numeric:100,efficiency_pct:0},
  {sample_uid:"a",observation_uid:"a2",test_type:"DH",exposure_duration_numeric:200,efficiency_pct:8},
]} as IVDataset;
test("stages use one exact time; terminal zero is observed, missing aged stays null",()=>{
 const result=stagedAgeing(dataset,{sampleUids:["a","b"],protocol:"DH",aged:{mode:"exact",time:200}});
 assert.equal(result.rows[0].retention,80);
 assert.equal(result.rows[1].aged.value,null);
 assert.deepEqual(result.counts,{before:2,post:2,aged:1});
 assert.ok(result.rows[1].aged.reasons.includes("missing_at_exact_time"));
 const common=stagedAgeing(dataset,{sampleUids:["a","b"],protocol:"DH",aged:{mode:"last-common"}});
 assert.equal(common.time,100);assert.equal(common.rows[1].retention,0);
});
test("stages retain QA exclusions, zero denominators and no-common-time without fallback",()=>{
 const changed=structuredClone(dataset);changed.observations[1].efficiency_pct=0;changed.observations[3].data_quality_flag="review";
 const result=stagedAgeing(changed,{sampleUids:["a","b"],protocol:"DH",aged:{mode:"exact",time:100}});
 assert.equal(result.rows[1].retention,null);assert.ok(result.rows[1].retentionReasons.includes("zero_baseline"));assert.ok(result.rows[1].aged.reasons.includes("qa_metric"));
 assert.equal(stagedAgeing(changed,{sampleUids:["a","b"],protocol:"DH",aged:{mode:"last-common"}}).time,null);
 assert.equal(stagedAgeing(changed,{sampleUids:["a","b"],excludedSampleUids:["b"],protocol:"DH",aged:{mode:"last-common"}}).time,200);
});
