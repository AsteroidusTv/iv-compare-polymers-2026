import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {parseOutdoor} from '../scripts/raw-parsers.mjs';

test('October Outdoor uses one active source per cell and retains historical daily IDs and PR exclusions',()=>{
 const registry=JSON.parse(fs.readFileSync('data/decisions/registry-v1.json','utf8'));
 const pack=JSON.parse(gunzipSync(fs.readFileSync('public/data/iv-compare-dowsil.ivpack')).toString());
 const daily=pack.observations.filter((r:{observation_uid:string})=>r.observation_uid.startsWith('ODD-'));
 assert.equal(registry.outdoor.length,23);
 assert.equal(new Set(registry.outdoor.map((r:{decision:{sample_uid:string}})=>r.decision.sample_uid)).size,23);
 assert.equal(daily.length,2293);
 assert.equal(daily.reduce((sum:number,r:{raw_count:number})=>sum+r.raw_count,0),406346);
 const byId=new Map(daily.map((r:{observation_uid:string})=>[r.observation_uid,r]));
 for(const old of registry.outdoorDailyIds){
  const current=byId.get(old.observation_uid) as {sample_uid:string}|undefined;
  assert.ok(current);assert.equal(current.sample_uid,old.sample_uid);
 }
 for(const old of registry.ignoredRawSources.filter((r:{target:string})=>r.target.startsWith('Outdoor/')))assert.ok(!daily.some((r:{source_file:string})=>r.source_file===old.target));
 const flagged=daily.filter((r:{data_quality_flag:string|null})=>r.data_quality_flag?.includes('outdoor_pr_adjudicated_fault'));
 assert.equal(flagged.length,4);
});

test('October logger timestamps accept one-digit hours and preserve source rows',()=>{
 const csv=Buffer.from('Time,Irr,PR,Pmpp\n2026-04-14 8:51,300,70,2\n2026-04-14 08:56:43,400,71,3\n');
 const rows=parseOutdoor(csv,'fixture.csv',{sample_uid:'S',installation_date:46126});
 assert.deepEqual(rows.map((r:{timestamp:string})=>r.timestamp),['2026-04-14 08:51:00','2026-04-14 08:56:43']);
 assert.deepEqual(rows.map((r:{source_row:number})=>r.source_row),[2,3]);
});
