import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import XLSX from "xlsx";
import { referenceLinkDiagnostic } from "../app/lib/reference-links.mjs";
import { validateDecisionRegistry } from "./rebuild-boundary.mjs";
import { loadLightAgeing } from "./light-ageing.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const processed = path.join(root, "data", "processed");
const workbookPath = path.join(processed, "IV_dataset_normalise_Outdoor.xlsx");
const pointsPath = path.join(processed, "IV_curve_points.tsv");
const outdoorRawPath = path.join(processed, "Outdoor_raw_measurements.tsv");
const protocolPath = path.join(processed, "normalization-protocol.json");
const outputs = [
  path.join(processed, "IV_Compare_DOWSIL.ivpack"),
  path.join(root, "public", "data", "iv-compare-dowsil.ivpack"),
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function sha256File(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    // Excel owner-lock files are ignored working files, not experimental sources.
    else if (entry.isFile() && !entry.name.startsWith("~$")) files.push(absolute);
  }
  return files;
}

async function rawTreeHash() {
  const files = await walk(path.join(root, "data", "raw"));
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(path.relative(root, file).split(path.sep).join("/"));
    hash.update("\0");
    hash.update(await sha256File(file));
    hash.update("\n");
  }
  return { digest: hash.digest("hex"), count: files.length };
}

function text(value) {
  return value === null || value === undefined || value === "" ? null : String(value);
}

function number(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function date(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  if (typeof value === "number" && value > 20_000 && value < 80_000) return new Date(Date.UTC(1899, 11, 30) + value * 86_400_000).toISOString().slice(0, 10);
  return text(value)?.slice(0, 10) ?? null;
}

function keep(row, fields) {
  return Object.fromEntries(fields.map((field) => [field, row[field] ?? null]));
}

function sheetRows(workbook, name) {
  const sheet = workbook.Sheets[name];
  if (!sheet) throw new Error(`Missing required workbook sheet: ${name}`);
  return XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });
}

function preEncapsulationReference(file, samples) {
  const diagnostic = referenceLinkDiagnostic(file, samples);
  return diagnostic.status === "matched" ? { sampleUid: diagnostic.sampleUid, basis: diagnostic.basis } : null;
}

async function readCurves() {
  const curves = {};
  const input = createReadStream(pointsPath, { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let headers = null;
  for await (const line of lines) {
    if (!headers) {
      headers = line.split("\t");
      continue;
    }
    if (!line) continue;
    const cells = line.split("\t");
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
    const uid = row.measurement_uid;
    const curve = curves[uid] ?? (curves[uid] = { v: [], j: [] });
    curve.v.push(number(row.voltage_V) === null ? null : Math.round(number(row.voltage_V) * 10_000_000) / 10_000_000);
    curve.j.push(number(row.generated_current_density_mA_cm2) === null ? null : Math.round(number(row.generated_current_density_mA_cm2) * 10_000_000) / 10_000_000);
  }
  return curves;
}

async function buildPayload() {
  const protocol = JSON.parse(await fs.readFile(protocolPath, "utf8"));
  const decisionRegistryBytes = await fs.readFile(path.join(root, "data", "decisions", "registry-v1.json"));
  const decisionRegistry = validateDecisionRegistry(JSON.parse(decisionRegistryBytes.toString("utf8")));
  const outdoorMetricAdjudications = decisionRegistry.outdoorMetricAdjudications;
  const appliedOutdoorAdjudications = new Set();
  const workbookBytes = await fs.readFile(workbookPath);
  const workbook = XLSX.read(workbookBytes, { type: "buffer", cellDates: true, raw: true });
  const samples = sheetRows(workbook, "Samples").map((row) => keep(row, [
    "sample_uid", "source_inventory_sheet", "source_inventory_row", "batch_no_raw", "electrode", "owner_or_general_comment", "initial_efficiency_pct_raw", "initial_efficiency_pct", "encapsulation_date", "encapsulation_date_raw", "material_raw", "material_family", "sample_id_raw", "sample_label", "recipe_uid", "recipe_raw", "nb_sheets_raw", "frame_raw", "ribbon_raw", "sample_comments", "assigned_test",
  ])).map((row) => ({ ...row, source_inventory_row: number(row.source_inventory_row), encapsulation_date: date(row.encapsulation_date) }));
  const recipes = sheetRows(workbook, "Recipes").map((row) => keep(row, [
    "recipe_uid", "recipe_raw", "laminator", "temperature_profile_C", "duration_profile_min", "duration_profile_s", "pressure_pairs_mbar", "pressure_values_mbar",
  ]));
  const observations = sheetRows(workbook, "Inventory_Obs").map((row) => ({
    ...keep(row, ["observation_uid", "sample_uid", "source_inventory_sheet", "test_type", "exposure_unit", "action_or_status", "comments", "data_quality_flag"]),
    exposure_duration_numeric: number(row.exposure_duration_numeric),
    efficiency_pct: number(row.efficiency_pct),
    jsc_mA_cm2: number(row.jsc_mA_cm2),
    voc_V: number(row.voc_V),
    ff_pct: number(row.ff_pct),
    source_row: number(row.source_inventory_row),
  }));
  observations.push(...sheetRows(workbook, "Outdoor_Daily").map((row) => {
    const matches = outdoorMetricAdjudications.filter((item) => item.target === text(row.source_file)
      && item.decision.sample_uid === text(row.sample_uid)
      && item.decision.measurement_date === date(row.measurement_date));
    if (matches.length > 1) throw new Error(`Multiple Outdoor PR adjudications match ${row.source_file} ${row.measurement_date}`);
    const adjudication = matches[0];
    if (adjudication) {
      if (number(row.daylight_count_irr_ge_200) !== adjudication.decision.expected_daylight_count
        || number(row.performance_ratio_pct_median) === null
        || Math.abs(number(row.performance_ratio_pct_median) - adjudication.oldValue) > 1e-9) {
        throw new Error(`Outdoor PR adjudication value/count mismatch: ${row.source_file} ${adjudication.decision.measurement_date}`);
      }
      appliedOutdoorAdjudications.add(adjudication);
    }
    const flags = [...new Set([text(row.qa_flags), adjudication?.decision.qa_flag].filter(Boolean))];
    return {
      observation_uid: row.outdoor_daily_uid,
      sample_uid: row.sample_uid,
      test_type: "Outdoor",
      exposure_duration_numeric: number(row.exposure_days),
      exposure_unit: "days",
      efficiency_pct: null,
      jsc_mA_cm2: null,
      voc_V: null,
      ff_pct: null,
      outdoor_pr_pct: number(row.performance_ratio_pct_median),
      outdoor_pmpp_W: number(row.pmpp_W_daylight_median ?? row.pmpp_W_max),
      outdoor_irradiance_W_m2: number(row.irradiance_W_m2_daylight_median ?? row.irradiance_W_m2_max),
      action_or_status: "outdoor_daily_aggregate",
      comments: adjudication ? `${text(row.aggregation_protocol) ?? ""} Owner adjudication: ${adjudication.reason}`.trim() : text(row.aggregation_protocol),
      data_quality_flag: flags.join(";") || null,
      source_file: text(row.source_file),
      aggregation_protocol: text(row.aggregation_protocol),
      raw_count: number(row.raw_count),
      daylight_count: number(row.daylight_count_irr_ge_200),
    };
  }));
  if (appliedOutdoorAdjudications.size !== outdoorMetricAdjudications.length) throw new Error("An Outdoor PR adjudication did not match exactly one daily source row.");
  const files = sheetRows(workbook, "IV_Files").map((row) => ({
    ...keep(row, ["file_uid", "source_file", "file_name", "measurement_group", "inferred_test_type", "inferred_exposure_unit", "material_family_inferred", "sample_uid", "match_status", "match_reasons", "matched_observation_uid", "matched_measurement_sheet"]),
    inferred_exposure_duration: number(row.inferred_exposure_duration),
    measurement_date: date(row.measurement_date),
    match_score: number(row.match_score),
    second_best_score: number(row.second_best_score),
    match_margin: number(row.match_margin),
    metric_fields_tight: number(row.metric_fields_tight),
    metric_mean_normalized_diff: number(row.metric_mean_normalized_diff),
  })).map((file) => {
    const reference = file.match_status === "reference_unassigned" ? preEncapsulationReference(file, samples) : null;
    return { ...file, reference_sample_uid: reference?.sampleUid ?? null, reference_match_basis: reference?.basis ?? null };
  });
  const measurements = sheetRows(workbook, "IV_Measurements").map((row) => ({
    ...keep(row, ["measurement_uid", "file_uid", "sample_uid", "match_status", "sheet_name", "measurement_time", "deposition_id", "substrate_comment", "measurement_comment", "user_name", "measurement_channel", "sweep_direction", "curve_voltage_unit_source", "curve_current_unit_source", "qa_flags"]),
    curve_series_index: number(row.curve_series_index),
    curve_series_count: number(row.curve_series_count),
    measurement_date: date(row.measurement_date),
    cell_number: number(row.cell_number),
    cell_area_cm2: number(row.cell_area_cm2),
    jsc_mA_cm2: number(row.jsc_mA_cm2),
    voc_V: number(row.voc_V),
    ff_pct: number(row.ff_pct),
    efficiency_pct: number(row.efficiency_pct),
    rsc_ohm_cm2: number(row.rsc_ohm_cm2),
    roc_ohm_cm2: number(row.roc_ohm_cm2),
    jmpp_mA_cm2: number(row.jmpp_mA_cm2),
    vmpp_V: number(row.vmpp_V),
    pmpp_mW_cm2: number(row.pmpp_mW_cm2),
    point_count: number(row.point_count),
    current_values_are_density: Boolean(row.current_values_are_density),
    curve_voltage_scale_to_V: number(row.curve_voltage_scale_to_V),
  }));
  const lightAgeing = await loadLightAgeing(root, samples);
  observations.push(...lightAgeing.observations);
  const curves = await readCurves();
  const rawTree = await rawTreeHash();
  const report = {
    samples: samples.length,
    recipes: recipes.length,
    observations: observations.length,
    files: files.length,
    measurements: measurements.length,
    points: Object.values(curves).reduce((total, curve) => total + curve.v.length, 0),
    matchedFiles: files.filter((row) => row.match_status?.startsWith("matched_")).length,
    reviewFiles: files.filter((row) => row.match_status === "ambiguous" || row.match_status === "unmatched").length,
    auditFiles: files.filter((row) => row.match_status === "reference_unassigned" || row.match_status === "audit_only").length,
  };
  return {
    schemaVersion: "1.2",
    name: "IV Compare — normalised IV and outdoor dataset",
    generatedOn: protocol.generatedOn,
    provenance: {
      pipelineVersion: protocol.pipelineVersion,
      rawTreeSha256: rawTree.digest,
      normalizedWorkbookSha256: sha256(workbookBytes),
      curvePointsSha256: await sha256File(pointsPath),
      outdoorRawSha256: await sha256File(outdoorRawPath),
      decisionRegistrySha256: sha256(decisionRegistryBytes),
      lightAgeingDecisionSha256: lightAgeing.manifestSha256,
      rawFileCount: rawTree.count,
      notes: protocol.notes,
    },
    report,
    samples,
    recipes,
    observations,
    files,
    measurements,
    curves,
  };
}

async function main() {
  const verify = process.argv.includes("--verify");
  const payload = await buildPayload();
  const bytes = gzipSync(Buffer.from(JSON.stringify(payload)), { level: 9, mtime: 0 });
  if (verify) {
    for (const output of outputs) {
      const existing = await fs.readFile(output);
      if (!existing.equals(bytes)) throw new Error(`${path.relative(root, output)} is stale; run pnpm data:build.`);
    }
  } else {
    await fs.writeFile(path.join(processed, 'Light_ageing_Pearl.json'), JSON.stringify(payload.observations.filter(row => row.test_type === 'Light ageing'), null, 2) + '\n');
    for (const output of outputs) {
      await fs.mkdir(path.dirname(output), { recursive: true });
      await fs.writeFile(output, bytes);
    }
  }
  console.log(JSON.stringify({ mode: verify ? "verified" : "written", sha256: sha256(bytes), compressedBytes: bytes.length, report: payload.report, provenance: payload.provenance }, null, 2));
}

await main();
