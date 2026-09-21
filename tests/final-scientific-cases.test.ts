import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { IVDataset } from "../app/lib/iv-data";
import { getJVDiagnostics, chooseSpecimenFirstMeasurement } from "../app/lib/jv-science";
import { normalizationTraces } from "../app/lib/normalization-trace";
import { labQualityIssues } from "../app/lib/lab-quality";
import { cohortTimeline, constantCohort } from "../app/lib/cohort";
import { stagedAgeing } from "../app/lib/staged-ageing";

const dataset=JSON.parse(gunzipSync(readFileSync("public/data/iv-compare-dowsil.ivpack")).toString()) as IVDataset;
test("final real-data re-audit: EVA TC disappearance is visible and constant cohort cannot silently recover",()=>{
 const ids=dataset.samples.filter(s=>s.material_family==="EVA").map(s=>s.sample_uid);
 const traces=normalizationTraces(dataset,{sampleUids:ids,protocol:"TC",metric:"efficiency_pct",mode:"retention",includeQa:false,outdoorWindow:7,qaIssues:labQualityIssues(dataset.observations,"efficiency_pct")});
 const rows=traces.filter(t=>t.value!==null).map(t=>({sampleUid:t.observation.sample_uid,time:t.observation.exposure_duration_numeric!,value:t.value!}));
 const available=cohortTimeline(rows,"mean"),common=constantCohort(rows,{start:20,end:100});
 assert.deepEqual(available.map(p=>p.n),[2,5,2]);
 assert.ok(Math.abs(available[1].summary.value-39.9467213115)<1e-8);
 assert.equal(available[2].apparentRecoveryRisk,true);
 assert.deepEqual(available[2].left,["SMP-188","SMP-194","SMP-196"]);
 const fixed=cohortTimeline(rows.filter(r=>common.sampleUids.includes(r.sampleUid)),"mean");
 assert.ok(Math.abs(fixed[1].summary.value-99.8668032787)<1e-8);
 assert.ok(fixed.every(p=>p.n===2&&!p.apparentRecoveryRisk));
 console.log(JSON.stringify({case:"EVA TC",available:available.map(p=>({time:p.time,n:p.n,mean:p.summary.value,risk:p.apparentRecoveryRisk})),constant:fixed.map(p=>({time:p.time,n:p.n,mean:p.summary.value}))}));
});
test("final real-data re-audit: legacy JV, repeated segments and sweep duplication remain quarantined",()=>{
 const diagnostics=getJVDiagnostics(dataset);
 const suspect=[...diagnostics.values()].flatMap(d=>d.segments.filter(s=>s.status==="suspected_export_residue"));
 assert.ok(suspect.length>=3330);
 for(const d of diagnostics.values()){
  assert.equal(d.quantitativeEligible,false);
  if(d.analysis.primaryIndex>=0)assert.notEqual(d.segments[d.analysis.primaryIndex].status,"suspected_export_residue");
 }
 const questionable=dataset.measurements.filter(m=>dataset.files.find(f=>f.file_uid===m.file_uid)?.source_file?.includes("04-17")&&diagnostics.get(m.measurement_uid)?.currentDensityStatus==="suspicious_surface_or_units");
 assert.equal(questionable.length,138);
 assert.equal(new Set(questionable.map(m=>m.file_uid)).size,12);
 assert.ok([...diagnostics.values()].filter(d=>d.currentDensityStatus==="suspicious_surface_or_units").length>=138);
 const candidates=dataset.measurements.filter(m=>["SMP-198","SMP-222"].includes(m.sample_uid??"")&&m.efficiency_pct!==null);
 const chosen=chooseSpecimenFirstMeasurement(candidates,dataset,true)?.sample_uid;
 assert.ok(chosen);
 const copies=Array.from({length:100},(_,i)=>({...candidates[0],measurement_uid:`audit-copy-${i}`}));
 const duplicated={...dataset,measurements:[...dataset.measurements,...copies],curves:{...dataset.curves,...Object.fromEntries(copies.map(m=>[m.measurement_uid,dataset.curves[candidates[0].measurement_uid]]))}};
 assert.equal(chooseSpecimenFirstMeasurement([...candidates,...copies],duplicated,true)?.sample_uid,chosen);
 console.log(JSON.stringify({case:"JV",diagnostics:diagnostics.size,suspectSegments:suspect.length,suspectMeasurements:[...diagnostics.values()].filter(d=>d.segments.some(s=>s.status==="suspected_export_residue")).length,quantitativelyEligible:0,duplicateInvariantSpecimen:chosen,quarantinedApril17:questionable.length}));
});
test("final real-data re-audit: exact staged times retain measured zeros and never invent missing values",()=>{
 const ids=dataset.samples.filter(s=>["EVA","POE-2 / TF4"].includes(s.material_family)&&(s.assigned_test==="TC"||dataset.observations.some(o=>o.sample_uid===s.sample_uid&&o.test_type==="TC"))).map(s=>s.sample_uid);
 const at50=stagedAgeing(dataset,{sampleUids:ids,protocol:"TC",aged:{mode:"exact",time:50}});
 assert.deepEqual(at50.counts,{before:4,post:9,aged:9});
 assert.deepEqual(at50.rows.filter(r=>r.aged.value===0).map(r=>r.sampleUid),["SMP-188","SMP-194","SMP-196"]);
 const absent=stagedAgeing(dataset,{sampleUids:ids,protocol:"TC",aged:{mode:"exact",time:51}});
 assert.equal(absent.counts.aged,0);assert.ok(absent.rows.every(r=>r.aged.reasons.includes("missing_at_exact_time")));
 assert.equal(stagedAgeing(dataset,{sampleUids:ids,protocol:"TC",aged:{mode:"last-common"}}).time,50);
});
