// Versioned intake: preserve originals, prove the overlap, bind reviewed exclusions to raw rows.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import XLSX from 'xlsx';
import {parsePearlSummary} from './light-ageing.mjs';
const root=path.resolve(import.meta.dirname,'..');
const source=process.argv[2];
if(!source)throw Error('Usage: node scripts/update-pearl-2026-10-16.mjs <received Pearl directory>');
const manifestPath=path.join(root,'data/decisions/light-ageing-pearl-v1.json');
const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
if(manifest.updates?.some(u=>u.date==='2026-10-16'))throw Error('Update already registered');
const sha=b=>createHash('sha256').update(b).digest('hex');
const sheet=b=>{const w=XLSX.read(b,{type:'buffer'});if(!w.Sheets.Summary)throw Error('Missing Summary');return XLSX.utils.sheet_to_json(w.Sheets.Summary,{header:1,defval:null});};
const windows=[
 {start:180.30,end:184.90}, {start:212.65,end:218.00}, {start:242.30,end:245.10},
 {start:261.80,end:263.10}, {start:475.60,end:478.00},
];
const files=[],audit=[],exclusions=[];
for(const entry of manifest.entries){
 const name=path.basename(entry.source),oldBytes=await fs.readFile(path.join(root,'data/raw',entry.source));
 const bytes=await fs.readFile(path.join(source,name)),old=sheet(oldBytes),rows=sheet(bytes);
 if(sha(oldBytes)!==manifest.rawHashes[entry.source])throw Error('Prior source hash mismatch');
 if(rows.length<=old.length||old.some((row,i)=>JSON.stringify(row)!==JSON.stringify(rows[i])))throw Error('Received workbook is not an unchanged extension: '+name);
 const txtName=name.replace(/\.xlsx$/,'.txt'),txtBytes=await fs.readFile(path.join(source,txtName));
 const txt=txtBytes.toString('utf8').trim().split(/\r?\n/).slice(4).map(l=>l.split('\t'));
 const byTime=new Map(rows.slice(4).map(r=>[Number(r[0]),r]));
 for(const r of txt){const match=byTime.get(Number(r[0]));if(!match||r.length!==match.length||r.some((v,i)=>!Number.isFinite(Number(v))||Math.abs(Number(v)-Number(match[i]))>1e-10))throw Error('TXT/XLSX mismatch: '+name);}
 const newSource='LightAgeing/Pearl_261016/'+name;
 parsePearlSummary(bytes,{...entry,source:newSource});
 files.push({source:newSource,bytes},{source:newSource.replace(/\.xlsx$/,'.txt'),bytes:txtBytes});
 // The original adjudications remain numerically identical; only bind them to the extended source.
 for(const ex of manifest.irradianceExclusions.filter(x=>x.source===entry.source)){
  const row=rows[ex.sourceRow-1];
  if(Number(row[0])!==ex.expectedTime_h||Number(row[7])!==ex.expectedForward_mW_cm2||Number(row[8])!==ex.expectedReverse_mW_cm2)throw Error('Old exclusion changed');
  ex.source=newSource;ex.sourceSha256=sha(bytes);
 }
 for(let i=4;i<rows.length;i++){
  const row=rows[i],t=Number(row[0]),window=windows.find(w=>t>=w.start&&t<=w.end);
  if(window)exclusions.push({source:newSource,sample_uid:entry.sample_uid,sourceRow:i+1,sourceSha256:sha(bytes),expectedTime_h:t,expectedForward_mW_cm2:Number(row[7]),expectedReverse_mW_cm2:Number(row[8]),decision:'exclude_both_directions_from_standard_trends',status:'reviewed_under_owner_authorized_filtering',date:'2026-10-16',window,reason:'Synchronized transient measurement interference across five cells, including adjacent recovery readings; Oulaya reports disturbance from a concurrent degradator experiment. Retained raw, excluded from electrical trends; no irradiance recalibration or temporal smoothing.',evidence:'Five-cell Pout co-excursion with return to the previous trend; photodiode excursions corroborate several episodes. The physical cause of individual readings is not established.'});
 }
 audit.push({sample_uid:entry.sample_uid,previousSource:entry.source,source:newSource,previousRows:old.length-4,receivedRows:rows.length-4,unchangedPrefixRows:old.length-4,txtRows:txt.length,initialRowsMissingInTxt:rows.length-4-txt.length,lastTime_h:Number(rows.at(-1)[0])});
 entry.previousSources=[...(entry.previousSources??[]),entry.source];entry.source=newSource;
}
// Finish all validation before any archive mutation. Never overwrite an existing raw file.
for(const file of files){const dest=path.join(root,'data/raw',file.source);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,file.bytes,{flag:'wx'});manifest.rawHashes[file.source]=sha(file.bytes);}
manifest.interferenceExclusions=exclusions;
manifest.updates=[...(manifest.updates??[]),{date:'2026-10-16',receivedDirectory:'Pearl data',message:'Oulaya: includes old and missing measurements; concurrent degradator experiment caused noisy values; filter required.',windows,audit,excludedRows:exclusions.length}];
await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({audit,interferenceRows:exclusions.length},null,2));
