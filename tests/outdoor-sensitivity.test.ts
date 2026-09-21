import test from "node:test";
import assert from "node:assert/strict";
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
test("Outdoor supplemental data cannot be attached to a different pack",()=>{
 const bundle={schemaVersion:"outdoor-sensitivity-bundle/1",compatiblePackageHashes:["a".repeat(64)],provenance:{registrySha256:"b".repeat(64)},analysis:outdoorSensitivity([])};
 assert.equal(validateOutdoorBundle(bundle,"a".repeat(64)),bundle);
 assert.throws(()=>validateOutdoorBundle(bundle,"c".repeat(64)),/do not match/);
 assert.throws(()=>validateOutdoorBundle(bundle,null),/do not match/);
});
