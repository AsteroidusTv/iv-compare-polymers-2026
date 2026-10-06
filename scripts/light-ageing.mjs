import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import XLSX from 'xlsx';
import { PEARL_QUANTITIES } from '../app/lib/pearl-metrics.mjs';

export function parsePearlSummary(bytes, entry) {
 const book=XLSX.read(bytes,{type:'buffer',cellDates:false});
 if(!book.Sheets.Summary)throw Error('light-ageing Summary sheet missing');
 const rows=XLSX.utils.sheet_to_json(book.Sheets.Summary,{header:1,defval:null});
 const headers=rows[3];
 if(!headers?.[0]?.startsWith('Timestamp_'))throw Error('Unsupported light-ageing headers');
 if(rows[1]?.slice(1).some(v=>v!==entry.substrate) || rows[2]?.slice(1).some(v=>v!==entry.cell))throw Error('light-ageing specimen metadata mismatch');
 const column=prefix=>{const i=headers.findIndex(h=>String(h).startsWith(prefix+'_'));if(i<0)throw Error('light-ageing missing '+prefix);return i;};
 column('Pout_F'); column('Pout_R');
 const metrics=PEARL_QUANTITIES.flatMap(quantity=>['forward','reverse'].map(direction=>({
  key:`light_${quantity.stem}_${direction}_${quantity.suffix}`, scale:quantity.scale, signed:quantity.signed,
  column:headers.findIndex(h=>String(h).startsWith(`${quantity.source}_${direction==='forward'?'F':'R'}_`)),
 })));
 const context=[1,2,3,4].flatMap(channel=>[
  {key:`light_temperature_${channel}_C`,column:headers.findIndex(h=>String(h).startsWith(`Temp_${channel}_`)),scale:1,signed:true},
  {key:`light_photo_${channel}_raw`,column:headers.findIndex(h=>String(h).startsWith(`Photo_${channel}_`)),scale:1,signed:true},
 ]);
 const number=v=>v===null||v===''?null:Number(v);
 let previous=-Infinity;
 return rows.slice(4).map((row,index)=>({row,sourceRow:index+5})).filter(({row})=>row.some(v=>v!==null)).map(({row,sourceRow},index)=>{
  const time=number(row[0]);
  if(!Number.isFinite(time)||time<0||time<=previous)throw Error('light-ageing time is invalid, duplicated or unordered');
  previous=time;
  const flags=[];
  const values={};
  for(const metric of [...metrics,...context]){
   const raw=metric.column<0?null:number(row[metric.column]);
   const value=raw===null||!Number.isFinite(raw)?null:raw*metric.scale;
   values[metric.key]=value;
   if(value===null||(!metric.signed&&value<0))flags.push(`non_numeric_metric:${metric.key}`);
  }
  return {observation_uid:`LAG-${entry.sample_uid}-${String(index+1).padStart(4,'0')}`,sample_uid:entry.sample_uid,test_type:'Light ageing',exposure_duration_numeric:time,exposure_unit:'h',
   ...values,
   efficiency_pct:null,jsc_mA_cm2:null,voc_V:null,ff_pct:null,
   source_file:entry.source,source_row:sourceRow,action_or_status:'Light-ageing measurement',
   comments:`${entry.substrate} / ${entry.cell}; separate F/R sweeps; filename/inventory specimen link is provisional. Pout is not PCE. FF fraction converted to percent; Impp retains signed amperes. Photodiodes retain source signal values (unit undocumented).`,
   data_quality_flag:flags.join(';')||null,aggregation_protocol:'Individual light-ageing summary row; elapsed source hours; FF × 100; signed Impp in A; no temporal averaging, interpolation or F/R pooling'};
 });
}

export async function loadLightAgeing(root,samples) {
 const manifestPath=path.join(root,'data/decisions/light-ageing-pearl-v1.json');
 let bytes;try{bytes=await fs.readFile(manifestPath);}catch(error){if(error.code==='ENOENT')return {observations:[],manifestSha256:null};throw error;}
 const manifest=JSON.parse(bytes),sha=b=>createHash('sha256').update(b).digest('hex');
 if(manifest.schemaVersion!=='pearl-light-ageing/1'||manifest.entries.length!==5)throw Error('Unsupported light-ageing manifest');
 const base=await fs.realpath(path.join(root,'data/raw/LightAgeing'));
 const archived=await fs.readdir(base,{recursive:true,withFileTypes:true});
 for(const file of archived.filter(file=>file.isFile())){
  const source=path.relative(path.join(root,'data/raw'),path.join(file.parentPath,file.name)).split(path.sep).join('/');
  if(!(source in manifest.rawHashes))throw Error('Unregistered light-ageing source: '+source);
 }
 for(const [source,hash] of Object.entries(manifest.rawHashes)){
  const file=await fs.realpath(path.join(root,'data/raw',source));
  if(!file.startsWith(base+path.sep))throw Error('light-ageing archive escapes raw boundary');
  if(sha(await fs.readFile(file))!==hash)throw Error('light-ageing archive changed: '+source);
 }
 /** @type {import('../app/lib/iv-data').Observation[]} */
 const observations=[];
 const ids=new Set();
 for(const entry of manifest.entries){
  if(ids.has(entry.sample_uid))throw Error('Duplicate light-ageing specimen');ids.add(entry.sample_uid);
  const sample=samples.find(s=>s.sample_uid===entry.sample_uid);
  if(!sample||sample.batch_no_raw!=='A4'||sample.material_family!==entry.material_family||sample.sample_id_raw!==entry.inventory_id)throw Error('light-ageing inventory identity mismatch');
  const file=await fs.realpath(path.join(root,'data/raw',entry.source));
  if(!file.startsWith(base+path.sep))throw Error('light-ageing source escapes raw boundary');
  const raw=await fs.readFile(file);
  if(sha(raw)!==manifest.rawHashes[entry.source])throw Error('light-ageing source changed: '+entry.source);
  const parsed=parsePearlSummary(raw,entry);
  for(const exclusion of (manifest.irradianceExclusions??[]).filter(item=>item.source===entry.source)){
   const row=parsed.find(row=>row.source_row===exclusion.sourceRow);
   if(exclusion.status!=='owner_adjudicated'||exclusion.decision!=='exclude_both_directions_from_standard_irradiance_trends'
    ||exclusion.sample_uid!==entry.sample_uid||exclusion.sourceSha256!==sha(raw)||!row
    ||row.exposure_duration_numeric!==exclusion.expectedTime_h
    ||row.light_pout_forward_mW_cm2!==exclusion.expectedForward_mW_cm2
    ||row.light_pout_reverse_mW_cm2!==exclusion.expectedReverse_mW_cm2)throw Error('light-ageing irradiance exclusion no longer matches its reviewed source');
   row.data_quality_flag=[row.data_quality_flag,'light_irradiance_changed'].filter(Boolean).join(';');
   row.comments+=' Excluded from standard-irradiance trends: '+exclusion.reason;
  }
  observations.push(...parsed);
 }
 const exclusions=manifest.irradianceExclusions??[];
 if(new Set(exclusions.map(item=>item.source+':'+item.sourceRow)).size!==exclusions.length
  ||exclusions.some(item=>!manifest.entries.some(entry=>entry.source===item.source)))throw Error('Duplicate or unknown light-ageing irradiance exclusion');
 return {observations,manifestSha256:sha(bytes)};
}
