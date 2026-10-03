// One-time owner-authorized exclusions; explicit source rows, never a live spike filter.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {parsePearlSummary,loadLightAgeing} from './light-ageing.mjs';
const root=path.resolve(import.meta.dirname,'..');
const file=path.join(root,'data/decisions/light-ageing-pearl-v1.json');
const manifest=JSON.parse(await fs.readFile(file,'utf8'));
if(manifest.irradianceExclusions)throw Error('Irradiance exclusions already registered');
manifest.irradianceExclusions=[];
for(const entry of manifest.entries){
 entry.baseline='First recorded same-cell and direction point after explicit different-irradiance exclusions';
 const bytes=await fs.readFile(path.join(root,'data/raw',entry.source));
 const observations=parsePearlSummary(bytes,entry);
 for(const sourceRow of [5,6,84]){
  const row=observations.find(row=>row.source_row===sourceRow);
  if(!row)throw Error('Missing reviewed source row');
  manifest.irradianceExclusions.push({source:entry.source,sample_uid:entry.sample_uid,sourceRow,
   sourceSha256:createHash('sha256').update(bytes).digest('hex'),
   expectedTime_h:row.exposure_duration_numeric,expectedForward_mW_cm2:row.light_pout_forward_mW_cm2,expectedReverse_mW_cm2:row.light_pout_reverse_mW_cm2,
   decision:'exclude_both_directions_from_standard_irradiance_trends',status:'owner_adjudicated',date:'2026-10-03',
   reason:sourceRow===6?'Elevated startup transition adjacent to the owner-identified 1.5-sun test; not comparable to the standard-irradiance series.':'Owner identified synchronized high-power spikes as a 1.5-sun test, not comparable to the standard-irradiance ageing series.',
   evidence:'Owner instruction plus synchronized forward/reverse power peaks in all five summaries at startup and approximately 21.3 h. No calibrated irradiance is inferred from photodiode readings.'});
 }
}
await fs.writeFile(file,JSON.stringify(manifest,null,2)+'\n');
const dataset=JSON.parse(gunzipSync(await fs.readFile(path.join(root,'public/data/iv-compare-dowsil.ivpack'))));
const light=await loadLightAgeing(root,dataset.samples);
await fs.writeFile(path.join(root,'data/processed/Light_ageing_Pearl.json'),JSON.stringify(light.observations,null,2)+'\n');
console.log(JSON.stringify({excludedRows:manifest.irradianceExclusions.length,rawRowsPreserved:light.observations.length}));
