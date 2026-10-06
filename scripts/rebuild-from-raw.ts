/** Clean-room builder. Inputs: raw files + versioned decision registry only. */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { gzipSync,gunzipSync } from "node:zlib";
import { parseInventory,parseIV,parseOutdoor } from "./raw-parsers.mjs";
import { outdoorSensitivity } from "../app/lib/outdoor-sensitivity";
import { referenceLinkDiagnostic } from "../app/lib/reference-links.mjs";
import { prepareRebuildOutput, validateDecisionRegistry, validateRawCoverage } from "./rebuild-boundary.mjs";
import { validateDataset, type Observation } from "../app/lib/iv-data";
import { loadLightAgeing } from "./light-ageing.mjs";
import { LIGHT_METRIC_KEYS } from '../app/lib/light-ageing-metrics';

const root=path.resolve(import.meta.dirname,"..");
const args=process.argv.slice(2);
const argument=(name:string)=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined;};
const outputArgument=argument("--out");
if(!outputArgument)throw Error("Usage: tsx scripts/rebuild-from-raw.ts --out <new or empty directory> [--compare <reference.ivpack>]");
const output=await prepareRebuildOutput(outputArgument,root),rawRoot=await fs.realpath(path.join(root,"data/raw"));
const sha=(bytes:Uint8Array|string)=>createHash("sha256").update(bytes).digest("hex");
const registryBytes=await fs.readFile(path.join(root,"data/decisions/registry-v1.json"));
if(registryBytes.length>20_000_000)throw Error("Oversized decision registry");
const registry=validateDecisionRegistry(JSON.parse(registryBytes.toString()));
validateRawCoverage(await fs.readdir(rawRoot,{recursive:true}),registry);
const rawBytes=new Map<string,Buffer>();
for(const [source,expected] of Object.entries(registry.rawHashes)){
 if(!/^(IV|Outdoor)\//.test(source)||source.split("/").includes(".."))throw Error(`Invalid source path ${source}`);
 const file=await fs.realpath(path.join(rawRoot,source));if(!file.startsWith(rawRoot+path.sep))throw Error("Raw path escapes boundary");
 if((await fs.stat(file)).size>100_000_000)throw Error(`Oversized source ${source}`);
 const bytes=await fs.readFile(file);if(sha(bytes)!==expected)throw Error(`Source changed; registry review required: ${source}`);rawBytes.set(source,bytes);
}
const inventory=parseInventory(rawBytes.get("IV/Summary.xlsx"),registry);
const files=[],measurements=[],curves:Record<string,{v:(number|null)[];j:(number|null)[]}>={};
const pointsFile=await fs.open(path.join(output,"IV_curve_points.tsv"),"wx");
await pointsFile.write("measurement_uid\tpoint_index\tsource_row\tvoltage_source_value\tcurrent_source_value\tvoltage_V\tgenerated_current_density_mA_cm2\n");
try{
 for(const [index,entry] of registry.matching.entries()){
  const parsed=parseIV(rawBytes.get(entry.target),entry.target,registry);
  const link=referenceLinkDiagnostic(parsed.file,inventory.samples);
  files.push({...parsed.file,reference_sample_uid:link.status==="matched"?link.sampleUid:null,reference_match_basis:link.status==="matched"?link.basis:null,reference_diagnostic:link});
  measurements.push(...parsed.measurements);Object.assign(curves,parsed.curves);
  await pointsFile.write(parsed.rawPoints.map(p=>[p.measurement_uid,p.point_index,p.source_row,p.voltage_source_value,p.current_source_value,p.voltage_V,p.generated_current_density_mA_cm2].map(v=>v??"").join("\t")).join("\n")+"\n");
  if(index%100===0)console.log(`Parsed ${index+1}/${registry.matching.length} IV files`);
 }
}finally{await pointsFile.close();}
const outdoor:ReturnType<typeof parseOutdoor>=registry.outdoor.flatMap((entry:{target:string;decision:Parameters<typeof parseOutdoor>[2]})=>parseOutdoor(rawBytes.get(entry.target),entry.target,entry.decision,registry.outdoorMetricAdjudications.filter((item:{target:string})=>item.target===entry.target)));
const sensitivity=outdoorSensitivity(outdoor);
const groups=new Map<string,typeof outdoor>();
for(const row of outdoor){const key=JSON.stringify([row.sample_uid,row.source_file,row.measurement_date]);const rows=groups.get(key)??[];rows.push(row);groups.set(key,rows);}
const daily=sensitivity.daily.filter(row=>row.threshold===200);
const dailyIds=new Map((registry.outdoorDailyIds??[]).map((r:{sample_uid:string;measurement_date:string;observation_uid:string})=>[JSON.stringify([r.sample_uid,r.measurement_date]),r.observation_uid]));
let nextDailyId=Math.max(0,...[...dailyIds.values()].map(id=>Number(String(id).slice(4))))+1;
const observations=[...inventory.observations,...daily.map((row,index)=>{
 const raw=groups.get(JSON.stringify([row.sampleUid,row.source,row.date]))!;
 const electricalOnly=row.reason==="irradiance_missing";
 const prAdjudication=row.metricExcludedRows.pr.find(item=>item.flag?.split(/[;,|]/).includes("outdoor_pr_adjudicated_fault"));
 const positive=raw.flatMap(item=>item.pmpp_W!==null&&item.pmpp_W>0?[item.pmpp_W]:[]).sort((a:number,b:number)=>a-b);
 const mid=positive.length?((positive[Math.floor((positive.length-1)/2)]+positive[Math.ceil((positive.length-1)/2)])/2):null;
 const observationUid=registry.outdoorDailyIds?dailyIds.get(JSON.stringify([row.sampleUid,row.date]))??`ODD-${String(nextDailyId++).padStart(5,"0")}`:`ODD-${String(index+1).padStart(5,"0")}`;
 return {observation_uid:observationUid,sample_uid:row.sampleUid,test_type:"Outdoor",exposure_duration_numeric:row.time,exposure_unit:"days",efficiency_pct:null,jsc_mA_cm2:null,voc_V:null,ff_pct:null,
  outdoor_pr_pct:row.prObserved,outdoor_pmpp_W:electricalOnly?mid:row.pmpp,outdoor_irradiance_W_m2:row.irradiance,
  action_or_status:"outdoor_daily_aggregate",data_quality_flag:electricalOnly?"irradiance_missing;pmpp_without_irradiance_filter;pr_missing;pr_unavailable":prAdjudication?"outdoor_pr_adjudicated_fault":row.reason,
  comments:prAdjudication?.reason??null,
  source_file:row.source,measurement_date:row.date,raw_count:row.rawCount,daylight_count:row.retainedRows,aggregation_protocol:"Daily median at irradiance >=200 W/m2; electrical-only positive Pmpp fallback flagged",raw_source_rows:raw.map(item=>item.source_row)};
})] as Observation[];
const lightAgeing=await loadLightAgeing(root,inventory.samples);
observations.push(...lightAgeing.observations);
const report={samples:inventory.samples.length,recipes:inventory.recipes.length,observations:observations.length,files:files.length,measurements:measurements.length,points:Object.values(curves).reduce((n,curve)=>n+curve.v.length,0),matchedFiles:files.filter(file=>file.match_status?.startsWith("matched_")).length,reviewFiles:files.filter(file=>["ambiguous","unmatched"].includes(file.match_status)).length};
const provenance={pipelineVersion:"raw-rebuild/2",registrySha256:sha(registryBytes),rawFileHashes:registry.rawHashes,lightAgeingDecisionSha256:lightAgeing.manifestSha256,notes:["Raw-only reconstruction. Legacy interpretation and matching decisions retained without experimental validation.","Owner-adjudicated Outdoor PR dates are metric-local exclusions; source logger values remain unchanged."]};
const payload={schemaVersion:"1.2",name:"IV Compare — raw reconstruction candidate",provenance,report,samples:inventory.samples,recipes:inventory.recipes,observations,files,measurements,curves};
validateDataset(payload);
const bytes=gzipSync(JSON.stringify(payload),{level:9});
await fs.writeFile(path.join(output,"candidate.ivpack"),bytes,{flag:"wx"});
await fs.writeFile(path.join(output,"normalized-relational.json.gz"),gzipSync(JSON.stringify({...payload,curves:undefined}),{level:9}),{flag:"wx"});
await fs.writeFile(path.join(output,"outdoor-raw.json.gz"),gzipSync(JSON.stringify(outdoor),{level:9}),{flag:"wx"});
await fs.writeFile(path.join(output,"outdoor-sensitivity.json"),JSON.stringify({...sensitivity,provenance}),{flag:"wx"});
const comparison=argument("--compare");
const differences:Record<string,unknown>={};
if(comparison){
 const reference=JSON.parse(gunzipSync(await fs.readFile(path.resolve(comparison))).toString());
 for(const key of ["samples","observations","files","measurements"] as const){
  const id={samples:"sample_uid",observations:"observation_uid",files:"file_uid",measurements:"measurement_uid"}[key];
  const left=reference[key] as Record<string,unknown>[],right=payload[key] as Record<string,unknown>[];
  const oldMap=new Map(left.map(row=>[row[id],row])),newMap=new Map(right.map(row=>[row[id],row]));
  const fields=key==="samples"?["material_family","material_raw","batch_no_raw","electrode","recipe_uid","assigned_test","initial_efficiency_pct","encapsulation_date"]:key==="observations"?["sample_uid","test_type","exposure_duration_numeric","efficiency_pct","jsc_mA_cm2","voc_V","ff_pct","outdoor_pr_pct","outdoor_pmpp_W","outdoor_irradiance_W_m2",...LIGHT_METRIC_KEYS]:key==="measurements"?["sample_uid","file_uid","jsc_mA_cm2","voc_V","ff_pct","efficiency_pct","pmpp_mW_cm2","point_count"]:["sample_uid","match_status","reference_sample_uid"];
  const changes=[];
  for(const [uid,row] of newMap){const old=oldMap.get(uid);if(!old)continue;for(const field of fields){const a=old[field]??null,b=row[field]??null;if(typeof a==="number"&&typeof b==="number"&&Math.abs(a-b)<1e-9)continue;if(JSON.stringify(a)!==JSON.stringify(b))changes.push({id:uid,field,before:a,after:b});}}
  differences[key]={oldCount:left.length,newCount:right.length,missingIds:[...oldMap.keys()].filter(id=>!newMap.has(id)),newIds:[...newMap.keys()].filter(id=>!oldMap.has(id)),changes};
  const metadataChanges:Record<string,{count:number;example:unknown}>={};
  for(const [uid,row] of newMap){const old=oldMap.get(uid);if(!old)continue;for(const field of Object.keys(old).filter(field=>!fields.includes(field))){const a=old[field]??null,b=row[field]??null;if(typeof a==="number"&&typeof b==="number"&&Math.abs(a-b)<1e-9)continue;if(JSON.stringify(a)!==JSON.stringify(b)){const prior=metadataChanges[field];metadataChanges[field]={count:(prior?.count??0)+1,example:prior?.example??{id:uid,before:a,after:b}};}}}
  differences[`${key}Metadata`]=metadataChanges;
 }
 const changedCurves=[];
 for(const [uid,curve] of Object.entries(curves)){const old=reference.curves[uid];if(JSON.stringify(curve)!==JSON.stringify(old))changedCurves.push(uid);}
 differences.curves={count:Object.keys(curves).length,changedCurves,missingIds:Object.keys(reference.curves).filter(uid=>!(uid in curves)),newIds:Object.keys(curves).filter(uid=>!(uid in reference.curves))};
 differences.referenceSha256=sha(await fs.readFile(path.resolve(comparison)));
}
const identicalAnalyticalData=comparison&&Object.values(differences).every(value=>typeof value!=="object"||value===null||Object.entries(value).every(([key,items])=>!["changes","missingIds","newIds","changedCurves"].includes(key)||Array.isArray(items)&&items.length===0));
await fs.writeFile(path.join(output,"outdoor-sensitivity.bundle.json.gz"),gzipSync(JSON.stringify({schemaVersion:"outdoor-sensitivity-bundle/1",compatiblePackageHashes:[sha(bytes),...(identicalAnalyticalData?[differences.referenceSha256]:[])],provenance,analysis:sensitivity}),{level:9}),{flag:"wx"});
await fs.writeFile(path.join(output,"rebuild-report.json"),JSON.stringify({report,provenance,candidateSha256:sha(bytes),outdoorRows:outdoor.length,thresholdRetainedRows:[100,200,300].map(threshold=>({threshold,n:sensitivity.daily.filter(row=>row.threshold===threshold).reduce((n,row)=>n+row.retainedRows,0)})),differences},null,2),{flag:"wx"});
console.log(JSON.stringify({output,report,outdoorRows:outdoor.length,candidateSha256:sha(bytes),comparison:comparison??null}));
