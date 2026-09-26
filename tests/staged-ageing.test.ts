import test from "node:test";
import assert from "node:assert/strict";
import type { IVDataset } from "../app/lib/iv-data";
import { stagedAgeing, stagedDisplayGroups } from "../app/lib/staged-ageing";
import { analysisGroups } from "../app/lib/cohort";
test("descriptive staged grouping combines unknown processes only with known matching formulation and batch",()=>{
 const samples=["a","b","c"].map(sample_uid=>({sample_uid,material_family:"TPO",material_raw:"TPO2",batch_no_raw:"A1",electrode:"Cu"}));
 assert.equal(analysisGroups(samples).length,3);
 assert.equal(analysisGroups(samples,"conservative",true).length,1);
 assert.equal(analysisGroups([...samples,{...samples[0],sample_uid:"d",batch_no_raw:"A2"}],"conservative",true).length,2);
 assert.equal(analysisGroups(samples.map(s=>({...s,batch_no_raw:null})),"conservative",true).length,3);
 assert.equal(analysisGroups([...samples,{...samples[0],sample_uid:"e",recipe_uid:"known"}],"conservative",true).length,2);
});
test("optional staged display pools visible groups by material and retains source groups",()=>{
 const samples=[
  {sample_uid:"a",material_family:"TPO",batch_no_raw:"A1"},
  {sample_uid:"b",material_family:"TPO",batch_no_raw:"A2"},
  {sample_uid:"c",material_family:"TPO",batch_no_raw:"A2"},
  {sample_uid:"d",material_family:"EVA",batch_no_raw:"A1"},
 ];
 const groups=[{key:"a1",label:"TPO A1",sampleUids:["a"]},{key:"a2",label:"TPO A2",sampleUids:["b","c"]},{key:"eva",label:"EVA A1",sampleUids:["d"]}];
 assert.equal(stagedDisplayGroups(groups,samples,[],[],false).length,3);
 const pooled=stagedDisplayGroups(groups,samples,[],["d"],true);
 assert.deepEqual(pooled,[{key:"material:TPO",label:"TPO",materialFamily:"TPO",sampleUids:["a","b","c"],sourceGroupKeys:["a1","a2"]}]);
 assert.deepEqual(stagedDisplayGroups(groups,samples,["a1"],[],true)[0].sampleUids,["b","c"]);
});
test("optional batch pooling still separates ribbon treatments",()=>{
 const samples=[
  {sample_uid:"a",material_family:"TPO",ribbon_raw:"3M-3011"},
  {sample_uid:"b",material_family:"TPO",ribbon_raw:"3M-3012"},
  {sample_uid:"c",material_family:"TPO",ribbon_raw:null},
 ];
 const groups=samples.map(sample=>({key:sample.sample_uid,label:sample.sample_uid,sampleUids:[sample.sample_uid]}));
 assert.equal(stagedDisplayGroups(groups,samples,[],[],true).length,1);
 assert.equal(stagedDisplayGroups(groups,samples,[],[],true,true).length,3);
});
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
