import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { IVDataset } from "../app/lib/iv-data";
import { encapsulationGroups, pairedChanges } from "../app/lib/encapsulation";
import { pairedFigureManifest, pairedFigureCsv } from "../app/lib/paired-export";
import { ribbonChoice } from "../app/lib/ribbon";
const dataset: IVDataset=JSON.parse(gunzipSync(readFileSync("public/data/iv-compare-dowsil.ivpack")).toString());
const selectedMaterials=[...new Set(dataset.samples.map(sample=>sample.material_family))];
const {groups}=encapsulationGroups(dataset.samples,dataset.observations,selectedMaterials,dataset.files);
const options={selectedMaterials,hiddenGroupKeys:[],showMeasurementInterval:true,colors:[],yMin:0,yMax:25};
test("connection visibility changes caption without changing paired contributors",()=>{
 const disconnected=pairedFigureManifest(dataset,groups,options);
 const connected=pairedFigureManifest(dataset,groups,{...options,showConnections:true});
 assert.match(disconnected.caption,/Aucune ligne entre les cellules/);
 assert.match(connected.caption,/Les lignes relient une même cellule/);
 assert.deepEqual(disconnected.actualContributors,connected.actualContributors);
 assert.deepEqual(disconnected.groups,connected.groups);
});
test("caption follows the selected mean, median or individual-only annotation",()=>{
 for(const deltaSummary of ["mean","median","none"] as const){
  const manifest=pairedFigureManifest(dataset,groups,{...options,deltaSummary});
  if(deltaSummary==="none")assert.match(manifest.caption,/Aucune variation résumée par groupe/);
  else assert.ok(manifest.caption.includes(`variation relative ${deltaSummary==="mean"?"moyenne":"médiane"}`));
 }
 const asymmetric=groups.find(group=>{const result=pairedChanges(group.pairs);return result.relative.mean!==result.relative.median;});
 assert.ok(asymmetric);
});
test("paired manifest preserves 46 pairs, raw provenance, dates and individual deltas",()=>{
  const manifest=pairedFigureManifest(dataset,groups,options);
  const rows=manifest.candidates.filter(row=>row.analyticalEligible);
  assert.equal(rows.length,46);
  for(const row of rows) {
    assert.equal(row.pair!.deltaPcePp,row.pair!.after-row.pair!.before);
    assert.ok(row.rawUnagedObservations.length===1);
    assert.ok(row.rawSample.sample_uid===row.sampleUid);
  }
  assert.ok(manifest.candidates.some(row=>!row.analyticalEligible&&row.exclusionReasons.length));
});
test("paired full-selected export respects the ribbon cohort and records the split",()=>{
  const ribbonSamples=dataset.samples.filter(sample=>sample.ribbon_raw==="3M-3011");
  const ids=new Set(ribbonSamples.map(sample=>sample.sample_uid));
  const split=encapsulationGroups(ribbonSamples,dataset.observations,selectedMaterials,dataset.files,true);
  const manifest=pairedFigureManifest(dataset,split.groups,{...options,allowedSampleUids:[...ids],ribbonSelection:ribbonChoice("3M-3011"),splitByRibbon:true});
  assert.ok(manifest.candidates.length>0);
  assert.ok(manifest.candidates.every(row=>ids.has(row.sampleUid)));
  assert.ok(manifest.groups.every(group=>group.ribbon==="3M-3011"));
  assert.match(manifest.caption,/séparées par libellé de ruban/);
  assert.match(manifest.caption,/Filtre : Ruban 3M-3011/);
  assert.ok(!pairedFigureCsv(manifest,"full-selected").includes('"SMP2-055"'));
});
test("hidden group keeps analytical eligibility; exclusion removes contributors with a recorded reason",()=>{
  const manifest=pairedFigureManifest(dataset,groups,{...options,hiddenGroupKeys:[groups[0].key],excludedGroupKeys:[groups[1].key]});
  const hidden=manifest.candidates.filter(row=>row.groupKey===groups[0].key);
  const excluded=manifest.candidates.filter(row=>row.groupKey===groups[1].key);
  assert.ok(hidden.every(row=>row.analyticalEligible&&row.visuallyHidden));
  assert.ok(excluded.every(row=>!row.analyticalEligible&&row.exclusionReasons.includes("user_excluded")));
  assert.ok(!manifest.groups.some(group=>group.key===groups[1].key));
  assert.ok(excluded.every(row=>!manifest.actualContributors.includes(row.sampleUid)));
  assert.ok(hidden.every(row=>manifest.actualContributors.includes(row.sampleUid)));
  const figure=pairedFigureCsv(manifest,"figure"), full=pairedFigureCsv(manifest,"full-selected");
  for(const row of [...hidden,...excluded]) {assert.ok(!figure.includes(`"${row.sampleUid}"`));assert.ok(full.includes(`"${row.sampleUid}"`));}
});
test("paired deltas distinguish mean of ratios, median and ratio of means; zero is retained absolutely",()=>{
  const pairs=[{before:10,after:20},{before:20,after:20},{before:0,after:3}].map((row,i)=>({...groups[0].pairs[0],...row,sampleUid:String(i)}));
  const result=pairedChanges(pairs);
  assert.deepEqual(result.relative,{n:2,mean:50,median:50});
  assert.equal(result.absolute.n,3);
  assert.equal(result.absolute.median,3);
  assert.equal(result.relativeChangeOfGroupMeans,13/30*100);
  assert.equal(result.individual[2].relative,null);
});
