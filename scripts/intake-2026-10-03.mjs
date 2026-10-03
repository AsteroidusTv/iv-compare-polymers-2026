/** Reviewed October intake; preserves raw snapshots and stable specimen/day IDs. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {parseOutdoor} from './raw-parsers.mjs';
import {validateDecisionRegistry} from './rebuild-boundary.mjs';
const root=path.resolve(import.meta.dirname,'..');
if(!process.argv[2])throw Error('Usage: node scripts/intake-2026-10-03.mjs <Data Achille source directory>');
const incoming=path.resolve(process.argv[2]);
const registryPath=path.join(root,'data/decisions/registry-v1.json');
const registry=JSON.parse(await fs.readFile(registryPath,'utf8'));
const auditPath=path.join(root,'data/decisions/intake-2026-10-03.json');
const audit=JSON.parse(await fs.readFile(auditPath,'utf8'));
if(registry.outdoor.length!==15 || audit.files.length!==19)throw Error('Intake already applied or unexpected coverage');
if(audit.files.some(f=>f.changedOverlap || f.missingOld))throw Error('Historical overlap needs manual review');
const sha=b=>createHash('sha256').update(b).digest('hex');
const previousBytes=await fs.readFile(path.join(root,'public/data/iv-compare-dowsil.ivpack'));
const previous=JSON.parse(gunzipSync(previousBytes));
const wbModule=await import('xlsx');
const wb=wbModule.default.read(await fs.readFile(path.join(root,'data/processed/IV_dataset_normalise_Outdoor.xlsx')));
registry.outdoorDailyIds=wbModule.default.utils.sheet_to_json(wb.Sheets.Outdoor_Daily).map(r=>({observation_uid:r.outdoor_daily_uid,sample_uid:r.sample_uid,measurement_date:typeof r.measurement_date==='number'?new Date(Date.UTC(1899,11,30)+r.measurement_date*86400000).toISOString().slice(0,10):String(r.measurement_date).slice(0,10)}));
audit.previousPackageSha256=sha(previousBytes);
audit.previousReport=previous.report;
let nextId=16;
for(const file of audit.files){
 const bytes=await fs.readFile(path.join(incoming,file.source));
 const target=path.join(root,'data/raw',file.source);
 await fs.mkdir(path.dirname(target),{recursive:true});
 await fs.writeFile(target,bytes,{flag:'wx'});
 registry.rawHashes[file.source]=sha(bytes);
 if(file.prior){
  const prior=registry.outdoor.find(e=>e.target===file.prior);
  if(!prior)throw Error('Prior source not registered');
  registry.ignoredRawSources.push({target:file.prior,oldValue:null,decision:'archive_only',reason:'Superseded by extended October logger export; prefix checked by ordered minute timestamps and numerical tolerance 1e-6. Original CSV retained.',source:file.source,status:'verified_export_supersession'});
  prior.target=file.source;
  prior.source='2026-10-03 intake; previous mapping retained and ordered historical prefix verified';
  for(const a of registry.outdoorMetricAdjudications.filter(e=>e.target===file.prior)){
   const rows=parseOutdoor(bytes,file.source,prior.decision).filter(r=>r.measurement_date===a.decision.measurement_date && r.irradiance_W_m2>=200);
   const values=rows.map(r=>r.performance_ratio_pct).filter(v=>v!==null).sort((a,b)=>a-b);
   const median=(values[Math.floor((values.length-1)/2)]+values[Math.ceil((values.length-1)/2)])/2;
   if(rows.length!==a.decision.expected_daylight_count || Math.abs(median-a.oldValue)>1e-6)throw Error('Adjudication evidence changed materially');
   audit.adjudicationRebases??=[];
   audit.adjudicationRebases.push({prior:a.target,target:file.source,date:a.decision.measurement_date,before:a.oldValue,after:median,daylightCount:rows.length});
   a.target=file.source;a.oldValue=median;
  }
 }else{
  const decision={...file.decision,outdoor_file_uid:`ODF-${String(nextId++).padStart(3,'0')}`};
  registry.outdoor.push({target:file.source,oldValue:null,decision,reason:'Unique A1 specimen token agrees with Outdoor assignment in active inventory; laboratory identity remains provisional.',source:'2026-10-03 intake: filename + installation folder + IV/Summary.xlsx',status:'provisional_filename_match'});
 }
}
const manifest=[];
async function archive(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){
 const file=path.join(dir,e.name);if(e.isDirectory()){await archive(file);continue;}
 const rel=path.relative(incoming,file).split(path.sep).join('/');const bytes=await fs.readFile(file);let archived;
 if(rel.startsWith('Cell-images/'))archived='data/raw/'+rel;
 else if(!rel.includes('/'))archived='data/context/'+rel;
 else if(/^IV\/Summary_v[23]\.xlsx$/.test(rel))archived='data/context/intake-2026-10-03/'+path.basename(file);
 if(archived){const dst=path.join(root,archived);await fs.mkdir(path.dirname(dst),{recursive:true});try{await fs.access(dst);if(sha(await fs.readFile(dst))!==sha(bytes))throw Error('Context conflict '+archived);}catch(error){if(error.code!=='ENOENT')throw error;await fs.writeFile(dst,bytes,{flag:'wx'});}}
 manifest.push({source:rel,sha256:sha(bytes),bytes:bytes.length,stored:archived??'data/raw/'+rel});
}}
await archive(incoming);
audit.manifest=manifest;
audit.activeOutdoorFiles=registry.outdoor.length;
validateDecisionRegistry(registry);
await fs.writeFile(registryPath,JSON.stringify(registry,null,2)+'\n');
await fs.writeFile(auditPath,JSON.stringify(audit,null,2)+'\n');
console.log(JSON.stringify({activeOutdoorFiles:registry.outdoor.length,receivedFiles:manifest.length,archivedHistoricalSources:11,photos:48}));
