import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const [mode, root, outputDir] = process.argv.slice(2);
if (!mode || !root || !outputDir) throw new Error("Usage: update_outdoor_workbook.mjs <inspect|edit> <repo-root> <output-dir>");
const inputPath = path.join(root, "data", "processed", "IV_dataset_normalise_Outdoor.xlsx");
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
const ivFileCount = workbook.worksheets.getItem("IV_Files").getUsedRange(true).values.length - 1;
const sampleCount = workbook.worksheets.getItem("Samples").getUsedRange(true).values.length - 1;
const inventoryObservationCount = workbook.worksheets.getItem("Inventory_Obs").getUsedRange(true).values.length - 1;
const ivSweepCount = workbook.worksheets.getItem("IV_Measurements").getUsedRange(true).values.length - 1;
const ivPointCount = Number(workbook.worksheets.getItem("README").getRange("B8").values[0][0]);
const ivFileMatrix = workbook.worksheets.getItem("IV_Files").getUsedRange(true).values;
const matchStatusColumn = ivFileMatrix[0].findIndex((value) => value === "match_status");
const matchedFileCount = ivFileMatrix.slice(1).filter((row) => String(row[matchStatusColumn]).startsWith("matched_")).length;
const reviewFileCount = ivFileCount - matchedFileCount;
await fs.mkdir(outputDir, { recursive: true });

async function render(name, range) {
  const preview = await workbook.render({ sheetName: name, range, scale: 1.25, format: "png" });
  await fs.writeFile(path.join(outputDir, `${name.replaceAll(/[^a-zA-Z0-9]+/g, "-")}.png`), new Uint8Array(await preview.arrayBuffer()));
}

if (mode === "inspect") {
  console.log((await workbook.inspect({ kind: "sheet", include: "id,name", maxChars: 5_000 })).ndjson);
  console.log((await workbook.inspect({ kind: "table", sheetId: "README", range: "A1:F33", include: "values,formulas", tableMaxRows: 40, tableMaxCols: 8, maxChars: 12_000 })).ndjson);
  console.log((await workbook.inspect({ kind: "table", sheetId: "Outdoor_Daily", range: "A1:M12", include: "values,formulas", tableMaxRows: 15, tableMaxCols: 15, maxChars: 15_000 })).ndjson);
  console.log((await workbook.inspect({ kind: "table", sheetId: "Data_Dictionary", range: "A1:D45", include: "values,formulas", tableMaxRows: 50, tableMaxCols: 6, maxChars: 15_000 })).ndjson);
  await render("README", "A1:F33");
  await render("Outdoor_Daily", "A1:M25");
  await render("Data_Dictionary", "A1:D37");
  process.exit(0);
}

function finite(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function median(values) {
  const ordered = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!ordered.length) return null;
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function dateKey(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && value > 20_000 && value < 80_000) return new Date(Date.UTC(1899, 11, 30) + value * 86_400_000).toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
}

async function outdoorGroups() {
  const groups = new Map();
  const input = createReadStream(path.join(root, "data", "processed", "Outdoor_raw_measurements.tsv"), { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let headers = null;
  for await (const line of lines) {
    if (!headers) {
      headers = line.split("\t");
      continue;
    }
    if (!line) continue;
    const cells = line.split("\t");
    const get = (name) => cells[headers.indexOf(name)] ?? "";
    const key = `${get("sample_uid")}\u0000${get("source_file")}\u0000${get("measurement_date")}`;
    const group = groups.get(key) ?? { rows: [], flags: new Set() };
    group.rows.push({ irradiance: finite(get("irradiance_W_m2")), pr: finite(get("performance_ratio_pct")), pmpp: finite(get("pmpp_W")) });
    if (get("qa_flags")) get("qa_flags").split(";").filter(Boolean).forEach((flag) => group.flags.add(flag));
    groups.set(key, group);
  }
  return groups;
}

const daily = workbook.worksheets.getItem("Outdoor_Daily");
const used = daily.getUsedRange(true);
const matrix = used.values;
const headers = matrix[0].map((value) => String(value ?? ""));
const index = Object.fromEntries(headers.map((header, column) => [header, column]));
const groups = await outdoorGroups();
const protocol = "PR, Pmpp and irradiance median for Irr>=200 W/m2; electrical-only files use median positive Pmpp with explicit QA flag";

matrix[0][index.pmpp_W_max] = "pmpp_W_daylight_median";
matrix[0][index.irradiance_W_m2_max] = "irradiance_W_m2_daylight_median";

for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
  const row = matrix[rowIndex];
  const key = `${row[index.sample_uid]}\u0000${row[index.source_file]}\u0000${dateKey(row[index.measurement_date])}`;
  const group = groups.get(key);
  if (!group) throw new Error(`No raw Outdoor rows found for ${key}`);
  const hasIrradiance = group.rows.some((item) => item.irradiance !== null);
  const daylight = group.rows.filter((item) => item.irradiance !== null && item.irradiance >= 200);
  const flags = new Set(group.flags);
  let pr = null;
  let pmpp = null;
  let irradiance = null;
  if (hasIrradiance) {
    pr = median(daylight.map((item) => item.pr).filter((value) => value !== null));
    pmpp = median(daylight.map((item) => item.pmpp).filter((value) => value !== null && value >= 0));
    irradiance = median(daylight.map((item) => item.irradiance).filter((value) => value !== null));
    if (!daylight.length) flags.add("no_measurement_at_irradiance_ge_200");
    if (pr === null) flags.add("no_pr_at_irradiance_ge_200");
    if (pmpp === null) flags.add("no_pmpp_at_irradiance_ge_200");
  } else {
    pmpp = median(group.rows.map((item) => item.pmpp).filter((value) => value !== null && value > 0));
    flags.add("irradiance_missing");
    flags.add("pr_unavailable");
    flags.add("pmpp_without_irradiance_filter");
  }
  row[index.raw_count] = group.rows.length;
  row[index.daylight_count_irr_ge_200] = daylight.length;
  row[index.performance_ratio_pct_median] = pr;
  row[index.pmpp_W_max] = pmpp;
  row[index.irradiance_W_m2_max] = irradiance;
  row[index.aggregation_protocol] = protocol;
  row[index.qa_flags] = [...flags].sort().join(";") || null;
}

used.values = matrix;
daily.getRange("I2:K1216").format.numberFormat = "0.00";
daily.getRange("A1:M1").format.wrapText = true;
daily.getRange("A1:M1").format.rowHeight = 42;
daily.freezePanes.freezeRows(1);

const readme = workbook.worksheets.getItem("README");
readme.getRange("A25:E33").format.wrapText = true;
readme.getRange("A1").values = [["Normalised IV dataset — perovskite encapsulation"]];
readme.getRange("A3:B10").values = [
  ["Metric", "Value"],
  ["Samples", sampleCount],
  ["Inventory observations", inventoryObservationCount],
  ["Binary IV files read", ivFileCount],
  ["IV sweeps", ivSweepCount],
  ["IV points", ivPointCount],
  ["Matched files (high/medium confidence)", matchedFileCount],
  ["Files to review (ambiguous/unmatched)", reviewFileCount],
];
readme.getRange("D3:E6").values = [
  ["Outdoor", "Value"],
  ["CSV files", 15],
  ["Raw measurements", 203122],
  ["Daily aggregates", 1215],
];
readme.getRange("A12").values = [["Relations and use"]];
readme.getRange("D13:D16").values = [
  ["Inventory of Unaged/DH/TC/Outdoor states"],
  ["File-to-sample match"],
  ["One sweep/series per row"],
  ["Points ordered by point_index"],
];
readme.getRange("A18").values = [["Transformation protocol and limitations"]];
readme.getRange("B19:C27").values = [
  ["Preserved sources", `IV/Summary_v2.xlsx and all ${ivFileCount} .xls files are never modified.`],
  ["Voltage", "Curve values are stored in mV in the source files; voltage_V = source_value × 0.001, including legacy headers labelled V [V]."],
  ["Current", "Simple V-I: density = current_mA / cell_area_cm2. Multi-cell V-J: the source value is already in mA/cm²."],
  ["Sign", "generated_current_density_mA_cm2 = -current_density_mA_cm2 so generated current is positive in the PV convention."],
  ["Dates", "Two m/d-localised serial dates were normalised from the European display/log context (10/4→2026-04-10; 7/5→2026-05-07)."],
  ["Matching", "Scores use material, filename aliases, electrode, batch generation, exposure, chronology, and proximity in efficiency/Jsc/Voc/FF."],
  ["Uncertainty", "Ambiguous or unmatched files retain an empty sample_uid; Match_Review records the three highest-scoring candidates. Non-encapsulated reference cells are retained for audit but excluded from polymer comparisons."],
  ["Quality", "Extreme measurements are not deleted. qa_flags preserve physical failures and measurement artefacts for review."],
  ["Outdoor", "Raw measurements are preserved losslessly in Outdoor_raw_measurements.tsv. Outdoor_Daily uses median PR, Pmpp, and irradiance at Irr ≥ 200 W/m². Files without irradiance use median positive Pmpp with an explicit flag. Retention uses the median of the first 3–7 valid days and the application reports 3/7/14-day sensitivity."],
];
readme.getRange("A29:B33").values = [
  ["Source", "Role"],
  ["IV/Summary_v2.xlsx", "Inventory, recipes, and summary results from both Lami-results sheets"],
  ["IV/**/*.xls", "Electrical parameters and IV/JV curve points"],
  ["Outdoor/**/*.csv", "Outdoor logger measurements exactly matched to 15 samples"],
  ["Ulicna-PVSC-54_2026.pdf + Summary DOWSIL PV-6326.pptx", "Scientific context and conventions; no document instructions were executed"],
];
for (const rangeAddress of ["A1:E1", "A12:E12", "A18:E18"]) {
  const range = readme.getRange(rangeAddress);
  range.format.fill = "#17889A";
  range.format.font = { bold: true, color: "#FFFFFF" };
}
readme.getRange("A1:E1").format.rowHeight = 30;
readme.getRange("A12:E12").format.rowHeight = 24;
readme.getRange("A18:E18").format.rowHeight = 24;

const dictionary = workbook.worksheets.getItem("Data_Dictionary");
const dictionaryValues = dictionary.getUsedRange(true).values;
const dictionaryDescriptions = {
  "Samples.sample_uid": "Traceable identifier derived from the source sheet and row in Summary_v2.xlsx.",
  "Samples.material_family": "Normalised family: Silicone/PDMS, EVA, POE-1/2/3, TPO-1/2, or Ionomer.",
  "Samples.recipe_uid": "Foreign key to Recipes; the source recipe remains in recipe_raw.",
  "Inventory_Obs.observation_uid": "One summary observation in the Unaged, DH, TC, or Outdoor state.",
  "Inventory_Obs.exposure_duration_numeric": "Hours for DH and cycles for TC; interpret with exposure_unit.",
  "Inventory_Obs.*_raw": "Preserved source value, including multi-value or visibly shifted cells.",
  "IV_Files.file_uid": "One physical .xls file.",
  "IV_Files.sample_uid": "Automatically matched sample; empty for ambiguous or unmatched files.",
  "IV_Files.match_status": "matched_high, matched_medium, ambiguous, or unmatched.",
  "IV_Files.match_score": "Matching score; interpret together with match_margin and match_reasons.",
  "IV_Measurements.measurement_uid": "One IV/JV sweep or one cell series from a multi-cell sheet.",
  "IV_Measurements.curve_series_index": "Series index when three cells share one worksheet.",
  "IV_Measurements.jsc_mA_cm2": "Short-circuit current density calculated by the source software.",
  "IV_Measurements.voc_V": "Source Voc converted from mV to V.",
  "IV_Measurements.ff_pct": "Fill factor in percent.",
  "IV_Measurements.efficiency_pct": "Power-conversion efficiency in percent.",
  "IV_Measurements.current_values_are_density": "True for multi-cell V-J sheets; false for V-I sheets.",
  "IV_Points.measurement_uid": "Foreign key to IV_Measurements.",
  "IV_Points.point_index": "Point acquisition order within the sweep.",
  "IV_Points.voltage_source_value": "Raw numeric value from the source voltage column.",
  "IV_Points.voltage_V": "voltage_source_value × 0.001.",
  "IV_Points.current_source_value": "Raw value; current_source_unit identifies current or current density.",
  "IV_Points.current_density_mA_cm2": "Raw value divided by area for V-I; unchanged for V-J.",
  "IV_Points.generated_current_density_mA_cm2": "Negative of current_density_mA_cm2 for a positive generated-current convention.",
  "IV_Points.generated_power_density_mW_cm2": "-voltage_V × current_density_mA_cm2.",
  "Match_Review.candidate_score": "Score of each of the three leading candidates for an unresolved file.",
  "Source_Rows.col_A…col_AI": "Flat copy of every non-empty row from both inventory sheets for audit.",
  "Outdoor_Files.sample_uid": "Inventory sample matched exactly to the Outdoor logger file.",
  "Outdoor_Raw.timestamp": "Normalised source timestamp; every CSV row remains preserved.",
  "Outdoor_Raw.irradiance_W_m2": "Raw incident irradiance from the logger; nullable for electrical-only schemas.",
  "Outdoor_Raw.performance_ratio_pct": "Raw Performance Ratio reported by the logger.",
  "Outdoor_Raw.pmpp_W": "Raw power at the maximum power point.",
  "Outdoor_Daily.exposure_days": "Calendar days since the sample installation date.",
  "Outdoor_Daily.performance_ratio_pct_median": "Daily median PR for irradiance ≥ 200 W/m².",
  "Outdoor_Daily.pmpp_W_daylight_median": "Daily median Pmpp for irradiance ≥ 200 W/m²; a positive median is explicitly flagged when irradiance is unavailable.",
  "Outdoor_Daily.irradiance_W_m2_daylight_median": "Median irradiance over the same daylight measurements used for PR and Pmpp.",
};
dictionaryValues.forEach((row) => {
  if (row[0] === "Outdoor_Daily" && row[1] === "pmpp_W_max") row[1] = "pmpp_W_daylight_median";
  if (row[0] === "Outdoor_Daily" && row[1] === "irradiance_W_m2_max") row[1] = "irradiance_W_m2_daylight_median";
  const key = `${row[0]}.${row[1]}`;
  if (dictionaryDescriptions[key]) row[3] = dictionaryDescriptions[key];
  if (row[0] === "IV_Points" && row[1] === "current_source_value") row[2] = "mA or mA/cm²";
  if (row[0] === "Outdoor_Daily" && row[1] === "exposure_days") row[2] = "days";
});
dictionary.getUsedRange(true).values = dictionaryValues;
dictionary.getRange("D36").format.wrapText = true;
dictionary.getRange("A36:D36").format.rowHeight = 30;

const rawInventory = await SpreadsheetFile.importXlsx(await FileBlob.load(path.join(root, "data", "raw", "IV", "Summary.xlsx")));
const rawInventoryValues = new Map(rawInventory.worksheets.items.map((sheet) => [sheet.name, sheet.getUsedRange(true).values]));
const sourceRows = workbook.worksheets.getItem("Source_Rows");
const sourceValues = sourceRows.getUsedRange(true).values;
const sourceHeaders = sourceValues[0];
const sourceSheetColumn = sourceHeaders.indexOf("source_inventory_sheet");
const sourceRowColumn = sourceHeaders.indexOf("source_inventory_row");
const firstRawColumn = sourceHeaders.indexOf("col_A");
for (let rowIndex = 1; rowIndex < sourceValues.length; rowIndex += 1) {
  const sourceSheetName = String(sourceValues[rowIndex][sourceSheetColumn]);
  const sourceRowNumber = Number(sourceValues[rowIndex][sourceRowColumn]);
  const rawRow = (rawInventoryValues.get(sourceSheetName) ?? [])[sourceRowNumber - 1] ?? [];
  for (let column = firstRawColumn; column < sourceValues[rowIndex].length; column += 1) sourceValues[rowIndex][column] = rawRow[column - firstRawColumn] ?? null;
}
sourceRows.getUsedRange(true).values = sourceValues;

workbook.recalculate();
const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 300 }, summary: "final formula error scan" });
console.log(errors.ndjson);
console.log((await workbook.inspect({ kind: "table", sheetId: "Outdoor_Daily", range: "A1:M12", include: "values,formulas", tableMaxRows: 15, tableMaxCols: 15, maxChars: 15_000 })).ndjson);

for (const sheet of [
  ["README", "A1:F33"], ["Samples", "A1:U15"], ["Recipes", "A1:H20"], ["Inventory_Obs", "A1:T15"], ["IV_Files", "A1:W12"], ["IV_Measurements", "A1:AH10"], ["IV_Points_Schema", "A1:F12"], ["Match_Review", "A1:I13"], ["Source_Rows", "A1:AK10"], ["Outdoor_Files", "A1:I16"], ["Outdoor_Raw_Schema", "A1:F14"], ["Outdoor_Daily", "A1:M25"], ["Data_Dictionary", "A1:D40"],
]) await render(sheet[0], sheet[1]);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(path.join(outputDir, "IV_dataset_normalise_Outdoor.xlsx"));
const repositoryOutput = await SpreadsheetFile.exportXlsx(workbook);
await repositoryOutput.save(inputPath);
