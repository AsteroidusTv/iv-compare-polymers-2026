// Export report traces using exactly the application's normalization and mandatory QA.
import fs from 'node:fs/promises';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {validateDataset} from '../app/lib/iv-data';
import {lightAgeingOverlay} from '../app/lib/light-ageing-overlay';
const output=process.argv[2];
if(!output)throw Error('Usage: pnpm exec tsx scripts/export-pearl-report.ts <output.json>');
const bytes=await fs.readFile('public/data/iv-compare-dowsil.ivpack');
const dataset=validateDataset(JSON.parse(gunzipSync(bytes).toString()));
const ids=['SMP2-060','SMP2-061','SMP2-062','SMP2-063','SMP2-064'];
const cells=lightAgeingOverlay(dataset,ids,'mean').map(cell=>({sampleUid:cell.sample.sample_uid,
 label:`${cell.sample.sample_uid==='SMP2-060'?'TPO-2 — lot A4 · cellule 1':cell.sample.sample_uid==='SMP2-061'?'TPO-2 — lot A4 · cellule 2':'POE-2 — lot A4 · cellule '+(Number(cell.sample.sample_uid.slice(-3))-61)}`,
 panels:cell.panels.map(p=>({label:p.label,metric:p.metric,color:p.color,dash:p.dash,points:p.points.map(pt=>({time:pt.time,value:pt.value,reasons:pt.reasons,sourceRow:pt.trace?.observation.source_row,source:pt.trace?.observation.source_file,absoluteValue:pt.trace?.absoluteValue,baselineValue:pt.trace?.baseline?.value}))}))}));
const data={generatedAt:new Date().toISOString(),packageSha256:createHash('sha256').update(bytes).digest('hex'),rule:'Arithmetic mean of F/R before normalization; original row 7 reference; no smoothing or interpolation; reviewed acquisition interference and irradiance changes excluded; full elapsed time retained.',cells};
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(data,null,2)+'\n');
console.log(JSON.stringify(cells.map(c=>({sample:c.sampleUid,nearest500:c.panels.map(p=>({metric:p.label,...p.points.filter(pt=>pt.value!==null).sort((a,b)=>Math.abs(a.time-500)-Math.abs(b.time-500))[0]}))})),null,2));
