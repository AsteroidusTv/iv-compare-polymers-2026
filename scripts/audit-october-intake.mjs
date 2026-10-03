import fs from 'node:fs';
import path from 'node:path';
import { parseOutdoor, parseInventory } from './raw-parsers.mjs';
const root = path.resolve(import.meta.dirname, '..');
if(!process.argv[2])throw Error('Usage: node scripts/audit-october-intake.mjs <Data Achille source directory>');
const incoming = path.resolve(process.argv[2]);
const registry = JSON.parse(fs.readFileSync(path.join(root, 'data/decisions/registry-v1.json')));
const samples = parseInventory(fs.readFileSync(path.join(root, 'data/raw/IV/Summary.xlsx')), registry).samples;
const walk = d => fs.readdirSync(d, {withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(path.join(d,e.name)) : [path.join(d,e.name)]);
const replacements = {
 'Ionomer_SL_2_final.csv':'ODF-001', 'TPO-1_CVF_SL_4_final.csv':'ODF-002', 'TPO-2_Lenzing_SL_2_30Sept2026.csv':'ODF-003',
 'EVA3_30Sept26.csv':'ODF-004', 'TPO2_Lenzing1_30Sept26.csv':'ODF-005', 'TPO2_Lenzing2_30Sept26.csv':'ODF-006',
 'POE1_Mitsui1_29Sept26.csv':'ODF-007', 'POE2_TF4_1_29Sept26.csv':'ODF-008', 'POE2_TF4_2_29Aug_26.csv':'ODF-009',
 'Low2_29Sept26.csv':'ODF-013', 'Low_29Sept26.csv':'ODF-014',
};
const results=[];
for(const file of walk(path.join(incoming,'Outdoor')).filter(f=>f.endsWith('.csv') && !fs.existsSync(path.join(root,'data/raw',path.relative(incoming,f))))) {
 const source=path.relative(incoming,file).split(path.sep).join('/');
 const prior=registry.outdoor.find(e=>e.decision.outdoor_file_uid===replacements[path.basename(file)]);
 let decision=prior?.decision;
 if(!decision) {
  const token=/^A1_(.+)_30Sept26.csv$/.exec(path.basename(file))?.[1];
  const family=token?.startsWith('CVF')?'TPO-1 / DNP-CVF':token?.startsWith('EVA')?'EVA':token?.startsWith('Len')?'TPO-2 / Lenzing':'POE-2 / TF4';
  const id=token?.replace('TF4-','TF4_');
  const candidates=samples.filter(s=>s.batch_no_raw==='A1' && s.material_family===family && s.sample_id_raw.startsWith(id+'_R'));
  if(candidates.length!==1)throw Error('Ambiguous '+source);
  decision={sample_uid:candidates[0].sample_uid,installation_date:46245,source_schema:'logger_standard',match_status:'matched_filename',match_basis:'Explicit A1 batch, material, specimen token and Installed_11Aug26 folder; provisional'};
 }
 const rows=parseOutdoor(fs.readFileSync(file),source,decision);
 const priorRows=prior?parseOutdoor(fs.readFileSync(path.join(root,'data/raw',prior.target)),prior.target,prior.decision):[];
 const changed=priorRows.filter((r,i)=>['irradiance_W_m2','performance_ratio_pct','pmpp_W'].some(k=>r[k]!==rows[i]?.[k] && (r[k]===null || rows[i]?.[k]===null || Math.abs(r[k]-rows[i]?.[k])>1e-6)));
 const absent=priorRows.filter((r,i)=>r.timestamp.slice(0,16)!==rows[i]?.timestamp.slice(0,16));
 results.push({source,prior:prior?.target??null,decision,rows:rows.length,priorRows:priorRows.length,changedOverlap:changed.length,missingOld:absent.length,first:rows[0]?.timestamp,last:rows.at(-1)?.timestamp,examples:changed.slice(0,2)});
}
const audit={source:'OneDrive_2026-10-03/Data Achille',files:results};
fs.writeFileSync(path.join(root,'data/decisions/intake-2026-10-03.json'),JSON.stringify(audit,null,2)+'\n');
console.log(JSON.stringify(results.map(({source,rows,priorRows,changedOverlap,missingOld})=>({source,rows,priorRows,changedOverlap,missingOld})),null,2));
