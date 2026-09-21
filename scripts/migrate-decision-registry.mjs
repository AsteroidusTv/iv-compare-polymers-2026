// One-time migration of historical DECISIONS, not a dataset builder. No metric,
// curve, daily aggregate or processed observation value is copied to the registry.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import XLSX from "xlsx";
const root=path.resolve(import.meta.dirname,"..");
const output=process.argv[2];
if(!output) throw Error("Usage: migrate-decision-registry.mjs <new-output.json>");
const workbook= XLSX.read(await fs.readFile(path.join(root,"data/processed/IV_dataset_normalise_Outdoor.xlsx")),{cellDates:false});
const rows=name=>XLSX.utils.sheet_to_json(workbook.Sheets[name],{defval:null});
const keep=(row,keys)=>Object.fromEntries(keys.map(key=>[key,row[key]??null]));
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const files=rows("IV_Files"),samples=rows("Samples");
const rawHashes={};
for(const file of [...files,...rows("Outdoor_Files"),{source_file:"IV/Summary.xlsx"}]) rawHashes[file.source_file]=sha(await fs.readFile(path.join(root,"data/raw",file.source_file)));
for(const source of ["IV/Summary_v1.xlsx","IV/Summary_v2.xlsx"])rawHashes[source]=sha(await fs.readFile(path.join(root,"data/raw",source)));
const source="data/processed/IV_dataset_normalise_Outdoor.xlsx (historical decision migration; original matcher unavailable)";
const decision=(target,oldValue,value,reason,status="legacy_unverified")=>({target,oldValue,decision:value,reason,source,status});
const uniqueRecipes=rows("Recipes");
const registry={schemaVersion:"iv-compare-decisions/1",version:"1.0.0",rawHashes,
  provenance:{source,sourceSha256:sha(await fs.readFile(path.join(root,"data/processed/IV_dataset_normalise_Outdoor.xlsx"))),migration:"Only identifiers, source coordinates and interpretation/matching decisions retained. Rebuild never reads this workbook."},
  parsing:{inventory:"summary-two-layouts/1",iv:"instrument-xls/1",outdoor:"logger-csv/1"},
  units:decision("legacy IV files","source voltage/current labels",{voltageScaleToV:0.001,currentRule:"V-I divided by source area; V-J already density",photovoltaicSign:-1},"Reproduce existing legacy conversion without physical validation; all scientific validations stay unresolved"),
  inventoryIds:samples.map(row=>keep(row,["sample_uid","source_inventory_sheet","source_inventory_row"])),
  observationIds:rows("Inventory_Obs").map(row=>keep(row,["observation_uid","sample_uid","source_inventory_sheet","source_inventory_row","test_type"])),
  measurementIds:rows("IV_Measurements").map(row=>keep(row,["measurement_uid","file_uid","source_file","sheet_name","sheet_index","curve_series_index"])),
  materialMappings:[...new Map(samples.map(row=>[row.material_raw,decision(`material:${row.material_raw}`,row.material_raw,row.material_family,"Preserve historical family label; not proof of formulation equivalence")])).values()],
  recipes:uniqueRecipes.map(row=>decision(`recipe:${row.recipe_raw}`,row.recipe_raw,row,"Preserve recorded recipe interpretation, not scientific equivalence")),
  recipeLinks:[...new Map(samples.filter(row=>row.recipe_raw&&row.recipe_uid).map(row=>[row.recipe_raw,decision(`recipe-link:${row.recipe_raw}`,row.recipe_raw,row.recipe_uid,"Preserve the historical recipe foreign key; not proof of scientific equivalence")])).values()],
  dates:samples.filter(row=>row.encapsulation_date!==null).map(row=>decision(`${row.source_inventory_sheet}:${row.source_inventory_row}:encapsulation_date`,row.encapsulation_date_raw,row.encapsulation_date,"Historical interpreted encapsulation date retained; source serial/text is preserved separately")),
  matching:files.map(row=>decision(row.source_file,null,keep(row,["file_uid","sample_uid","match_status","match_score","second_best_score","match_margin","match_reasons","matched_observation_uid","matched_measurement_sheet","metric_fields_tight","metric_mean_normalized_diff","inferred_test_type","inferred_exposure_duration","inferred_exposure_unit","material_family_inferred"]),"Historical matching decision and scores; scores not recalculated or represented as independently validated")),
  matchingCandidates:rows("Match_Review"),
  outdoor:rows("Outdoor_Files").map(row=>decision(row.source_file,null,keep(row,["outdoor_file_uid","sample_uid","installation_date","source_schema","match_status","match_basis"]),"Historical source-to-inventory and installation mapping")),
  manualExclusions:[],experimentalAdjudications:[],
  ignoredRawSources:[decision("IV/Summary_v1.xlsx",null,"archive_only","Archived superseded inventory; active source is IV/Summary.xlsx"),decision("IV/Summary_v2.xlsx",null,"duplicate_inventory","Byte-identical copy of active IV/Summary.xlsx")],
};
await fs.writeFile(path.resolve(output),JSON.stringify(registry,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({output,files:files.length,samples:samples.length,measurements:registry.measurementIds.length,status:"legacy decisions migrated; not validated"}));
