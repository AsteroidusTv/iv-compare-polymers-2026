import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {validateDataset} from '../app/lib/iv-data';

const dataset=validateDataset(JSON.parse(gunzipSync(fs.readFileSync('public/data/iv-compare-dowsil.ivpack')).toString()));

test('October 15 inventory preserves distinct A5 R references and explicit terminal zero measurements',()=>{
 const a5=dataset.samples.filter(s=>s.batch_no_raw==='A5');
 assert.deepEqual(a5.map(s=>s.sample_id_raw),['1_R9','1_R7','1_R2']);
 assert.equal(new Set(a5.map(s=>s.sample_uid)).size,3);
 assert.ok(a5.every(s=>s.initial_efficiency_pct===null));
 const zero=dataset.observations.filter(o=>o.test_type==='DH'&&o.efficiency_pct===0&&[3030,2130].includes(o.exposure_duration_numeric??-1));
 assert.equal(zero.length,2);
 assert.ok(zero.every(o=>o.action_or_status?.includes('stopped')));
 assert.equal(dataset.observations.find(o=>o.observation_uid==='OBS-0374')?.efficiency_pct,13.8);
 assert.equal(dataset.observations.find(o=>o.observation_uid==='OBS-0415')?.exposure_duration_numeric,50);
});

test('new IV links require four source metrics and retain unresolved files without a sample',()=>{
 const incoming=dataset.files.filter(f=>Number(f.file_uid.slice(4))>=469);
 assert.equal(incoming.length,77);
 for(const file of incoming){
  if(file.match_status==='unmatched'){
   assert.equal(file.sample_uid,null);
   continue;
  }
  assert.equal(file.match_status,'matched_filename_stage');
  const observation=dataset.observations.find(o=>o.observation_uid===file.matched_observation_uid);
  const sweep=dataset.measurements.find(m=>m.file_uid===file.file_uid&&m.sheet_name===Reflect.get(file,'matched_measurement_sheet'));
  assert.ok(observation&&sweep);
  assert.equal(observation.sample_uid,file.sample_uid);
  assert.equal(observation.exposure_duration_numeric,file.inferred_exposure_duration);
  for(const [field,tolerance] of [['efficiency_pct',.051],['jsc_mA_cm2',.051],['voc_V',.0051],['ff_pct',.051]] as const){
   assert.ok(observation[field]!==null&&sweep[field]!==null);
   assert.ok(Math.abs(observation[field]!-sweep[field]!)<=tolerance);
  }
  if(file.source_file?.includes('DH750'))assert.ok([730,780].includes(file.inferred_exposure_duration??-1));
 }
 for(const file of incoming.filter(f=>f.source_file?.includes('/A5_Unaged/')))assert.equal(file.sample_uid,null);
});
