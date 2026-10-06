import test from "node:test";
import assert from "node:assert/strict";
import XLSX from "xlsx";
import type { IVDataset } from "../app/lib/iv-data";
import { fullJVSelectionCsv, fullJVMeasurementIds, jvSelectionLedger } from "../app/lib/jv-full-export";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { identityLinePattern, materialStyle, segmentLinePattern } from "../app/lib/material-style";

test("full JV CSV retains unresolved and null source points, with stable indices and no trend substitution",()=>{
 const dataset:IVDataset={schemaVersion:"1.2",name:"fixture",samples:[],recipes:[],observations:[],files:[{file_uid:"F",source_file:"IV/fixture.xls",match_status:"matched_high",inferred_test_type:"DH",inferred_exposure_duration:100}],measurements:[{measurement_uid:"M",file_uid:"F",sample_uid:"S",match_status:"matched_high",voc_V:1,efficiency_pct:15}],curves:{M:{v:[0,null,.5,1],j:[20,19,10,0]}},report:{samples:0,recipes:0,observations:0,files:1,measurements:1,points:4,matchedFiles:1,reviewFiles:0}};
 const csv=fullJVSelectionCsv(dataset,["M"]),book=XLSX.read(csv,{type:"string",raw:true}),rows=XLSX.utils.sheet_to_json<Record<string,string>>(book.Sheets[book.SheetNames[0]],{defval:null});
 assert.equal(rows.length,4);assert.deepEqual(rows.map(row=>row.source_point_index),["0","1","2","3"]);
 assert.equal(rows[1].point_status,"non_numeric_point");assert.equal(rows[1].V,null);
 assert.ok(rows.every(row=>row.screening_eligible==="true"&&row.quantitative_eligible==="false"));assert.equal(rows[2].V,"0.5");assert.equal(rows[2].J,"10");
 assert.ok(!csv.includes("observation_uid"));assert.equal(fullJVSelectionCsv(dataset,[]),"");
 const quarantined=jvSelectionLedger(dataset,["M"],[],[100],false,false)[0];
 assert.equal(quarantined.included,false);assert.deepEqual(quarantined.reasons,["not_selected_sweep"]);
 const inspected=jvSelectionLedger(dataset,["M"],["M"],[100],true,true)[0];
 assert.equal(inspected.included,true);assert.deepEqual(inspected.reasons,[]);assert.equal(inspected.validation?.unitValidated,false);
});
test("visual identities are independent of visible selection order",()=>{
 const ids=["SMP-003","SMP-222","SMP-137"];
 const first=Object.fromEntries(ids.map(id=>[id,identityLinePattern(id)]));
 const reversed=Object.fromEntries([...ids].reverse().map(id=>[id,identityLinePattern(id)]));
 assert.deepEqual(first,reversed);assert.equal(materialStyle("EVA").color,"#D55E00");
 assert.equal(segmentLinePattern(true,"unresolved","8 5"),"8 5");
 assert.notEqual(segmentLinePattern(false,"unresolved"),segmentLinePattern(false,"suspected_export_residue"));
});
test("full ageing JV selection includes all Unaged and aged sweeps of the same specimen",()=>{
 const dataset:IVDataset=JSON.parse(gunzipSync(readFileSync("public/data/iv-compare-dowsil.ivpack")).toString());
 const ids=fullJVMeasurementIds(dataset,[{id:"s",material:"Silicone / PDMS",stress:"DH",metric:"efficiency_pct",electrode:"all",recipe:"all"}],"ageing","SMP-014");
 assert.ok(ids.includes("MEA-00189"));
 assert.ok(ids.every(id=>dataset.measurements.find(row=>row.measurement_uid===id)!.sample_uid==="SMP-014"));
 const selectedFiles=dataset.files.filter(file=>dataset.measurements.some(row=>ids.includes(row.measurement_uid)&&row.file_uid===file.file_uid));
 assert.deepEqual([...new Set(selectedFiles.map(file=>file.inferred_test_type))].sort(),["DH","Unaged"]);
});
test("full JV selection does not leak specimens outside the selected ribbon",()=>{
 const dataset:IVDataset=JSON.parse(gunzipSync(readFileSync("public/data/iv-compare-dowsil.ivpack")).toString());
 const config={id:"s",material:"TPO-2 / Lenzing",stress:"DH",metric:"efficiency_pct" as const,electrode:"all",recipe:"all"};
 const all=fullJVMeasurementIds(dataset,[config],"materials",null);
 const ids=new Set(dataset.samples.filter(sample=>sample.ribbon_raw==="3M-3011").map(sample=>sample.sample_uid));
 const filtered=fullJVMeasurementIds(dataset,[config],"materials",null,ids);
 assert.ok(filtered.length<=all.length);
 assert.ok(filtered.every(id=>ids.has(dataset.measurements.find(row=>row.measurement_uid===id)?.sample_uid??"")));
});
