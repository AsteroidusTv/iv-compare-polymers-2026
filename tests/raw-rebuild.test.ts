import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import XLSX from "xlsx";
import { parseInventory, parseIV, parseOutdoor } from "../scripts/raw-parsers.mjs";
import { prepareRebuildOutput, validateDecisionRegistry, validateRawCoverage } from "../scripts/rebuild-boundary.mjs";

test("raw inventory fixture → relational rows → pack preserves zero, flags and stable identities",()=>{
 const workbook=XLSX.utils.book_new();
 const row=Array(33).fill(null);Object.assign(row,{0:"A1",1:"Cu",4:"EVA",5:"1",11:0,12:20,13:1,14:"broken"});
 XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([[],[],row]),"Lami-results");
 XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([[],[]]),"Lami-results2");
 const registry={recipes:[],materialMappings:[{oldValue:"EVA",decision:"EVA"}],dates:[],inventoryIds:[{sample_uid:"S1",source_inventory_sheet:"Lami-results",source_inventory_row:3}],observationIds:[{observation_uid:"O1",source_inventory_sheet:"Lami-results",source_inventory_row:3,test_type:"Unaged"}]};
 const bytes=XLSX.write(workbook,{type:"buffer",bookType:"xlsx"});
 const first=parseInventory(bytes,registry),again=parseInventory(bytes,registry);
 assert.deepEqual(first,again);
 assert.equal(Reflect.get(first.observations[0],"efficiency_pct"),0);
 assert.equal(Reflect.get(first.observations[0],"ff_pct"),null);
 assert.equal(first.observations[0].data_quality_flag,"non_numeric_metric:ff");
 assert.deepEqual(JSON.parse(gunzipSync(gzipSync(JSON.stringify(first))).toString()),first);
 assert.throws(()=>parseInventory(bytes,{...registry,inventoryIds:[]}),/identity registration/);
});

test("raw IV fixture retains source values and legacy quarantine instead of supplying validated data",()=>{
 const rows=Array.from({length:9},()=>Array(54).fill(null));
 rows[0][1]="IV measurement of 17.04.2026 @ 12:00:00";
 rows[4][52]="V";rows[4][53]="I";
 rows[5][52]=0;rows[5][53]=-2;
 rows[6][52]=1000;rows[6][53]=0;
 Object.assign(rows[6],{1:1,2:1,3:0.1,4:20,5:1000,6:75,7:15,12:15});
 const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(rows),"exp");
 const registry={matching:[{target:"IV/test.xls",decision:{file_uid:"F1",sample_uid:"S1"}}],measurementIds:[{source_file:"IV/test.xls",sheet_name:"exp",curve_series_index:0,measurement_uid:"M1"}],units:{decision:{voltageScaleToV:.001}}};
 const result=parseIV(XLSX.write(workbook,{type:"buffer",bookType:"xlsx"}),"IV/test.xls",registry);
 assert.deepEqual(Reflect.get(result.curves,"M1"),{v:[0,1],j:[20,-0]});
 assert.equal(result.rawPoints[0].current_source_value,-2);
 assert.equal(result.rawPoints[0].source_row,6);
 assert.deepEqual(result.measurements[0].scientific_validation,{});
 assert.match(result.measurements[0].conversion_applied,/unresolved/);
});

test("outdoor raw parser preserves metric-specific absence and source row",()=>{
 const result=parseOutdoor(Buffer.from("Time,Irr,PR,Pmpp\n2026-01-02 12:00:00,200,,0.4\n"),"Outdoor/test.csv",{installation_date:46023,sample_uid:"S1"});
 assert.equal(result[0].performance_ratio_pct,null);assert.equal(result[0].pmpp_W,.4);
 assert.equal(result[0].source_row,2);assert.equal(result[0].qa_flags,"pr_missing");
});

test("rebuild refuses occupied outputs and symlink redirection to production before mkdir",async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),"iv-boundary-test-"));
 await fs.mkdir(path.join(root,"data"));await fs.mkdir(path.join(root,"public"));
 await fs.symlink(path.join(root,"data"),path.join(root,"alias"));
 await assert.rejects(prepareRebuildOutput(path.join(root,"alias","must-not-exist"),root),/production data/);
 await assert.rejects(fs.stat(path.join(root,"data","must-not-exist")),{code:"ENOENT"});
 await assert.rejects(prepareRebuildOutput(path.join(root,"staging"),root),/production data/);
 const external=await fs.mkdtemp(path.join(os.tmpdir(),"iv-stage-test-"));
 const stage=await prepareRebuildOutput(path.join(external,"staging"),root);
 await fs.writeFile(path.join(stage,"sentinel"),"preserve");
 await assert.rejects(prepareRebuildOutput(stage,root),/refusing overwrite/);
 assert.equal(await fs.readFile(path.join(stage,"sentinel"),"utf8"),"preserve");
});

test("registry rejects traversal, duplicate identities and unapplied future decisions",async()=>{
 const registry=JSON.parse(await fs.readFile("data/decisions/registry-v1.json","utf8"));
 assert.equal(validateDecisionRegistry(registry),registry);
 assert.throws(()=>validateRawCoverage([...Object.keys(registry.rawHashes),"IV/new-contradictory-R.xls"],registry),/New raw file/);
 validateRawCoverage(Object.keys(registry.rawHashes),registry);
 assert.throws(()=>validateDecisionRegistry({...registry,rawHashes:{"IV/../processed.xlsx":"a".repeat(64)}}),/source path/);
 assert.throws(()=>validateDecisionRegistry({...registry,inventoryIds:[...registry.inventoryIds,registry.inventoryIds[0]]}),/duplicate/);
 assert.throws(()=>validateDecisionRegistry({...registry,experimentalAdjudications:[{target:"M1",oldValue:null,decision:true,reason:"fixture",source:"fixture",status:"validated"}]}),/application-policy review/);
 const code=await fs.readFile("scripts/rebuild-from-raw.ts","utf8");
 assert.ok(!code.includes("data/processed"));
 assert.ok(code.indexOf('const comparison=argument("--compare")')>code.indexOf('"candidate.ivpack"'));
});
