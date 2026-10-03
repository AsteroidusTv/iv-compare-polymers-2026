import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import XLSX from 'xlsx';
import {loadLightAgeing} from './light-ageing.mjs';
const root=path.resolve(import.meta.dirname,'..');
if(!process.argv[2])throw Error('Usage: node scripts/intake-pearl.mjs <Pearl source directory>');
const source=path.resolve(process.argv[2]);
const destination=path.join(root,'data/raw/LightAgeing/Pearl_261001');
const manifestPath=path.join(root,'data/decisions/light-ageing-pearl-v1.json');
try{await fs.access(manifestPath);throw Error('Pearl intake already exists; refusing replacement');}catch(error){if(error.code!=='ENOENT')throw error;}
const previousPackage=await fs.readFile(path.join(root,'public/data/iv-compare-dowsil.ivpack'));
const previousDataset=JSON.parse(gunzipSync(previousPackage));
const samples=previousDataset.samples;
const sha=b=>createHash('sha256').update(b).digest('hex');
const hashes={},entries=[],txtAudit=[];
const previousPackageSha256=sha(previousPackage);
const previousOutdoorObservationsSha256=sha(JSON.stringify(previousDataset.observations.filter(row=>row.test_type==='Outdoor')));
async function copy(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){
 const file=path.join(dir,e.name);if(e.isDirectory()){await copy(file);continue;}
 const relative=path.relative(source,file);const bytes=await fs.readFile(file);const target=path.join(destination,relative);
 await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes,{flag:'wx'});
 hashes['LightAgeing/Pearl_261001/'+relative.split(path.sep).join('/')]=sha(bytes);
}}
await copy(source);
for(const name of (await fs.readdir(source)).filter(n=>n.endsWith('.xlsx')).sort()){
 const book=XLSX.read(await fs.readFile(path.join(source,name))),matrix=XLSX.utils.sheet_to_json(book.Sheets.Summary,{header:1,defval:null});
 const substrate=matrix[1][1],cell=matrix[2][1];
 const match=/^A4-(len|TF4-)(\d)$/i.exec(substrate);if(!match)throw Error('Unsupported Pearl substrate');
 const family=match[1].toLowerCase()==='len'?'TPO-2 / Lenzing':'POE-2 / TF4';
 const candidates=samples.filter(s=>s.batch_no_raw==='A4'&&s.material_family===family&&s.sample_id_raw.startsWith(match[2]+'_R'));
 if(candidates.length!==1)throw Error('Ambiguous Pearl specimen');const sample=candidates[0];
 entries.push({source:'LightAgeing/Pearl_261001/'+name,sample_uid:sample.sample_uid,inventory_id:sample.sample_id_raw,material_family:family,substrate,cell,status:'provisional_filename_inventory_match',timeUnit:'h',powerUnit:'mW/cm2',unitEvidence:'Evolution_Len1.png and Evolution_TF4.png axes',baseline:'First recorded same-cell and direction Pearl point'});
 const txt=(await fs.readFile(path.join(source,name.replace('.xlsx','.txt')),'utf8')).trim().split(/\r?\n/).slice(4).map(line=>line.split('\t'));
 const xlsx=matrix.slice(4),byTime=new Map(xlsx.map(row=>[Number(row[0]),row]));
 let mismatch=0;for(const row of txt){const original=byTime.get(Number(row[0]));if(!original||row.some((v,i)=>Math.abs(Number(v)-Number(original[i]))>1e-10))mismatch++;}
 if(mismatch)throw Error('TXT/XLSX overlapping values disagree');
 txtAudit.push({substrate,summaryRows:xlsx.length,txtRows:txt.length,initialRowsMissingInTxt:xlsx.length-txt.length,overlapRowsVerified:txt.length});
}
await fs.writeFile(manifestPath,JSON.stringify({schemaVersion:'pearl-light-ageing/1',source:'Experiment_Pearl_261001/Experiment_Pearl',previousPackageSha256,previousOutdoorObservationsSha256,rawHashes:hashes,entries,txtAudit,notes:['XLSX Summary is authoritative; Lenzing TXT omits three initial rows per cell. Both formats archived without double counting.','JVs and evolution PNGs are archived as evidence; JV curves are not added to the legacy solar-simulator parser.','Source time is elapsed hours, not accumulated illuminated-dose hours. Incident irradiance and controlled temperature are not established.']},null,2)+'\n');
const data=await loadLightAgeing(root,samples);
await fs.writeFile(path.join(root,'data/processed/Light_ageing_Pearl.json'),JSON.stringify(data.observations,null,2)+'\n');
console.log(JSON.stringify({archivedFiles:Object.keys(hashes).length,observations:data.observations.length,specimens:entries.length,txtAudit}));
