import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import XLSX from 'xlsx';

export function parsePearlSummary(bytes, entry) {
 const book=XLSX.read(bytes,{type:'buffer',cellDates:false});
 if(!book.Sheets.Summary)throw Error('Pearl Summary sheet missing');
 const rows=XLSX.utils.sheet_to_json(book.Sheets.Summary,{header:1,defval:null});
 const headers=rows[3];
 if(!headers?.[0]?.startsWith('Timestamp_'))throw Error('Unsupported Pearl headers');
 if(rows[1]?.slice(1).some(v=>v!==entry.substrate) || rows[2]?.slice(1).some(v=>v!==entry.cell))throw Error('Pearl specimen metadata mismatch');
 const column=prefix=>{const i=headers.findIndex(h=>String(h).startsWith(prefix+'_'));if(i<0)throw Error('Pearl missing '+prefix);return i;};
 const f=column('Pout_F'),r=column('Pout_R');
 const number=v=>v===null||v===''?null:Number(v);
 let previous=-Infinity;
 return rows.slice(4).map((row,index)=>({row,sourceRow:index+5})).filter(({row})=>row.some(v=>v!==null)).map(({row,sourceRow},index)=>{
  const time=number(row[0]),forward=number(row[f]),reverse=number(row[r]);
  if(!Number.isFinite(time)||time<0||time<=previous)throw Error('Pearl time is invalid, duplicated or unordered');
  previous=time;
  const flags=[];
  for(const [key,value] of [['light_pout_forward_mW_cm2',forward],['light_pout_reverse_mW_cm2',reverse]])if(value===null||!Number.isFinite(value)||value<0)flags.push(`non_numeric_metric:${key}`);
  return {observation_uid:`LAG-${entry.sample_uid}-${String(index+1).padStart(4,'0')}`,sample_uid:entry.sample_uid,test_type:'Light ageing',exposure_duration_numeric:time,exposure_unit:'h',
   light_pout_forward_mW_cm2:Number.isFinite(forward)?forward:null,light_pout_reverse_mW_cm2:Number.isFinite(reverse)?reverse:null,
   efficiency_pct:null,jsc_mA_cm2:null,voc_V:null,ff_pct:null,
   source_file:entry.source,source_row:sourceRow,action_or_status:'Pearl light-ageing measurement',
   comments:`${entry.substrate} / ${entry.cell}; separate F/R sweeps; filename/inventory specimen link is provisional. Irradiance is undocumented; Pout is not PCE.`,
   data_quality_flag:flags.join(';')||null,aggregation_protocol:'Individual Pearl summary row; elapsed source hours; no temporal averaging, interpolation or F/R pooling'};
 });
}

export async function loadLightAgeing(root,samples) {
 const manifestPath=path.join(root,'data/decisions/light-ageing-pearl-v1.json');
 let bytes;try{bytes=await fs.readFile(manifestPath);}catch(error){if(error.code==='ENOENT')return {observations:[],manifestSha256:null};throw error;}
 const manifest=JSON.parse(bytes),sha=b=>createHash('sha256').update(b).digest('hex');
 if(manifest.schemaVersion!=='pearl-light-ageing/1'||manifest.entries.length!==5)throw Error('Unsupported Pearl manifest');
 const base=await fs.realpath(path.join(root,'data/raw/LightAgeing'));
 const archived=await fs.readdir(base,{recursive:true,withFileTypes:true});
 for(const file of archived.filter(file=>file.isFile())){
  const source=path.relative(path.join(root,'data/raw'),path.join(file.parentPath,file.name)).split(path.sep).join('/');
  if(!(source in manifest.rawHashes))throw Error('Unregistered Pearl source: '+source);
 }
 for(const [source,hash] of Object.entries(manifest.rawHashes)){
  const file=await fs.realpath(path.join(root,'data/raw',source));
  if(!file.startsWith(base+path.sep))throw Error('Pearl archive escapes raw boundary');
  if(sha(await fs.readFile(file))!==hash)throw Error('Pearl archive changed: '+source);
 }
 /** @type {import('../app/lib/iv-data').Observation[]} */
 const observations=[];
 const ids=new Set();
 for(const entry of manifest.entries){
  if(ids.has(entry.sample_uid))throw Error('Duplicate Pearl specimen');ids.add(entry.sample_uid);
  const sample=samples.find(s=>s.sample_uid===entry.sample_uid);
  if(!sample||sample.batch_no_raw!=='A4'||sample.material_family!==entry.material_family||sample.sample_id_raw!==entry.inventory_id)throw Error('Pearl inventory identity mismatch');
  const file=await fs.realpath(path.join(root,'data/raw',entry.source));
  if(!file.startsWith(base+path.sep))throw Error('Pearl source escapes raw boundary');
  const raw=await fs.readFile(file);
  if(sha(raw)!==manifest.rawHashes[entry.source])throw Error('Pearl source changed: '+entry.source);
  const parsed=parsePearlSummary(raw,entry);
  for(const exclusion of (manifest.irradianceExclusions??[]).filter(item=>item.source===entry.source)){
   const row=parsed.find(row=>row.source_row===exclusion.sourceRow);
   if(exclusion.status!=='owner_adjudicated'||exclusion.decision!=='exclude_both_directions_from_standard_irradiance_trends'
    ||exclusion.sample_uid!==entry.sample_uid||exclusion.sourceSha256!==sha(raw)||!row
    ||row.exposure_duration_numeric!==exclusion.expectedTime_h
    ||row.light_pout_forward_mW_cm2!==exclusion.expectedForward_mW_cm2
    ||row.light_pout_reverse_mW_cm2!==exclusion.expectedReverse_mW_cm2)throw Error('Pearl irradiance exclusion no longer matches its reviewed source');
   row.data_quality_flag=[row.data_quality_flag,'light_irradiance_changed'].filter(Boolean).join(';');
   row.comments+=' Excluded from standard-irradiance trends: '+exclusion.reason;
  }
  observations.push(...parsed);
 }
 const exclusions=manifest.irradianceExclusions??[];
 if(new Set(exclusions.map(item=>item.source+':'+item.sourceRow)).size!==exclusions.length
  ||exclusions.some(item=>!manifest.entries.some(entry=>entry.source===item.source)))throw Error('Duplicate or unknown Pearl irradiance exclusion');
 return {observations,manifestSha256:sha(bytes)};
}
