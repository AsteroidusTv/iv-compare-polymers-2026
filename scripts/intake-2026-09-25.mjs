/** One-time, evidence-preserving intake of Summary_v3 and the September IV sources. */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import XLSX from "xlsx";
import { parseInventory } from "./raw-parsers.mjs";
import { validateDecisionRegistry } from "./rebuild-boundary.mjs";

const root = path.resolve(import.meta.dirname, "..");
const raw = path.join(root, "data/raw/IV");
const registryPath = path.join(root, "data/decisions/registry-v1.json");
const oldBytes = await fs.readFile(path.join(raw, "Summary.xlsx"));
const nextBytes = await fs.readFile(path.join(raw, "Summary_v3.xlsx"));
const registry = validateDecisionRegistry(JSON.parse(await fs.readFile(registryPath, "utf8")));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
if (sha(oldBytes) !== "9219720e406f1fa48b32def395b4f57c18f159d6735b77d5952f6112f461bafd") {
  throw Error("This intake must start from the registered Summary_v2 inventory");
}
const oldBook = XLSX.read(oldBytes, { type: "buffer" });
const nextBook = XLSX.read(nextBytes, { type: "buffer" });
const types = [["Unaged", 11, 5], ["DH", 16, 7], ["TC", 23, 7], ["Outdoor", 30, 3]];
const populated = value => value !== null && value !== undefined && value !== "";
function groups(book, name) {
  const offset = name.endsWith("2") ? 1 : 0;
  const rows = XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, defval: null });
  const groups = [];
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (populated(row[4 + offset]) || populated(row[5 + offset])) {
      groups.push({ row: i + 1, rawMaterial: row[4 + offset], id: row[5 + offset], observations: [] });
    }
    if (!groups.length) continue;
    for (const [type, base, length] of types) {
      const values = row.slice(base + offset, base + offset + length);
      if (values.some(populated)) groups.at(-1).observations.push({ row: i + 1, type, values });
    }
  }
  return groups;
}
const rowRebase = new Map();
const inventoryIds = [];
const observationIds = [];
const changes = { existingSamples: 0, newSamples: 0, existingObservations: 0, newObservations: 0, sourceValueChanges: [] };
let nextSample = 60, nextObservation = 373;
for (const name of ["Lami-results", "Lami-results2"]) {
  const before = groups(oldBook, name), after = groups(nextBook, name);
  if (after.length < before.length) throw Error(`Sample deletion in ${name}`);
  for (let index = 0; index < after.length; index++) {
    const current = after[index], previous = before[index];
    if (previous && (String(previous.rawMaterial) !== String(current.rawMaterial) || String(previous.id) !== String(current.id))) {
      throw Error(`Sample sequence changed in ${name} at index ${index}`);
    }
    const oldIdentity = previous && registry.inventoryIds.find(item => item.source_inventory_sheet === name && item.source_inventory_row === previous.row);
    if (previous && !oldIdentity) throw Error(`Missing old identity ${name}:${previous.row}`);
    const sample_uid = oldIdentity?.sample_uid ?? `SMP2-${String(nextSample++).padStart(3, "0")}`;
    inventoryIds.push({ sample_uid, source_inventory_sheet: name, source_inventory_row: current.row });
    if (previous) { rowRebase.set(`${name}:${previous.row}`, current.row); changes.existingSamples++; }
    else changes.newSamples++;
    const free = [...current.observations];
    for (const observation of previous?.observations ?? []) {
      const old = registry.observationIds.find(item => item.source_inventory_sheet === name && item.source_inventory_row === observation.row && item.test_type === observation.type);
      if (!old || old.sample_uid !== sample_uid) throw Error(`Missing or contradictory old observation ${name}:${observation.row}:${observation.type}`);
      const sameType = free.filter(item => item.type === observation.type);
      const exact = sameType.filter(item => JSON.stringify(item.values) === JSON.stringify(observation.values));
      const durationIndex = observation.type === "DH" || observation.type === "TC" ? 4 : -1;
      const sameDuration = durationIndex >= 0 ? sameType.filter(item => populated(item.values[durationIndex]) && String(item.values[durationIndex]) === String(observation.values[durationIndex])) : [];
      const sameMetrics = sameType.filter(item => JSON.stringify(item.values.slice(0, 4)) === JSON.stringify(observation.values.slice(0, 4)));
      const matches = exact.length === 1 ? exact : sameDuration.length === 1 ? sameDuration : sameMetrics.length === 1 ? sameMetrics : sameType.length === 1 ? sameType : [];
      if (matches.length !== 1) throw Error(`Unresolved observation rebase ${name}:${observation.row}:${observation.type}`);
      const match = matches[0];
      free.splice(free.indexOf(match), 1);
      observationIds.push({ observation_uid: old.observation_uid, sample_uid, source_inventory_sheet: name, source_inventory_row: match.row, test_type: match.type });
      changes.existingObservations++;
      if (JSON.stringify(observation.values) !== JSON.stringify(match.values)) changes.sourceValueChanges.push({ observation_uid: old.observation_uid, before: observation.values, after: match.values });
    }
    for (const observation of free) {
      observationIds.push({ observation_uid: `OBS-${String(nextObservation++).padStart(4, "0")}`, sample_uid, source_inventory_sheet: name, source_inventory_row: observation.row, test_type: observation.type });
      changes.newObservations++;
    }
  }
}
if (changes.existingSamples !== 135 || changes.newSamples !== 11 || changes.existingObservations !== 372 || changes.newObservations !== 49) {
  throw Error(`Unexpected inventory counts ${JSON.stringify(changes)}`);
}
registry.inventoryIds = inventoryIds;
registry.observationIds = observationIds;
registry.dates = registry.dates.map(item => {
  const match = /^(Lami-results2?):(\d+):encapsulation_date$/.exec(item.target);
  if (!match) throw Error(`Unknown date decision target ${item.target}`);
  const rebased = rowRebase.get(`${match[1]}:${match[2]}`);
  if (!rebased) throw Error(`Date decision has no corresponding sample ${item.target}`);
  return { ...item, target: `${match[1]}:${rebased}:encapsulation_date` };
});
registry.materialMappings.push({ target: "POE-3_Cybrid", oldValue: "POE-3_Cybrid", decision: "POE-3 / Cybrid T22", reason: "Summary_v3 A4 formulation label; family aligned with recorded Cybrid T22", source: "IV/Summary_v3.xlsx:Lami-results2!F76:F81", status: "source_label_mapping" });
registry.rawHashes["IV/Summary.xlsx"] = sha(nextBytes);
registry.rawHashes["IV/Summary_v3.xlsx"] = sha(nextBytes);
const archivedV2 = registry.ignoredRawSources.find(item => item.target === "IV/Summary_v2.xlsx");
if (!archivedV2) throw Error("Missing Summary_v2 archive decision");
Object.assign(archivedV2, { decision: "archive_only", reason: "Superseded Summary_v2 inventory; the active IV/Summary.xlsx now equals Summary_v3.xlsx", source: "2026-09-25 inventory version selection and SHA256 comparison", status: "historical_snapshot" });
registry.ignoredRawSources.push({ target: "IV/Summary_v3.xlsx", oldValue: null, decision: "duplicate_inventory", reason: "Archived byte-identical copy of active IV/Summary.xlsx", source: "SHA256 comparison during 2026-09-25 intake", status: "verified_bytes_only" });
const inventory = parseInventory(nextBytes, registry);
const observationsBySample = new Map(inventory.samples.map(item => [item.sample_uid, inventory.observations.filter(row => row.sample_uid === item.sample_uid)]));
const direct = source => {
  let batch, family, prefix, type, duration;
  const file = path.basename(source, ".xls").replace(/-(shunt|delam)$/i, "");
  if (source.includes("/A2_A3_DH_R1/")) {
    type = "DH";
  } else if (source.includes("/A1_TC150/")) { type = "TC"; duration = 150; }
  else if (source.includes("/A2_A3_TC50/")) { type = "TC"; duration = 50; }
  else if (source.includes("/A4_Unaged/")) { type = "Unaged"; }
  else return null;
  const match = /^(A[1-4])_(CVF(?:_SL)?\d|Len(?:_SL)?\d|EVA\d|TF4[-_]?\d|Cyb\d)$/.exec(file);
  if (!match) throw Error(`Unknown direct-match file name ${source}`);
  batch = match[1]; prefix = match[2];
  if (prefix.startsWith("CVF")) family = "TPO-1 / DNP-CVF";
  else if (prefix.startsWith("Len")) family = "TPO-2 / Lenzing";
  else if (prefix.startsWith("EVA")) family = "EVA";
  else if (prefix.startsWith("TF4")) family = "POE-2 / TF4";
  else family = "POE-3 / Cybrid T22";
  let idPrefix = prefix.replace(/^TF4[-_]?/, "TF4_").replace(/^Len_SL/, "SL").replace(/^CVF_SL/, "SL").replace(/^A/, "");
  if (batch !== "A1" && family === "TPO-1 / DNP-CVF") idPrefix = prefix.replace(/^CVF_?/, "");
  if (batch !== "A1" && family === "TPO-2 / Lenzing") idPrefix = prefix.replace(/^Len_?/, "");
  if (batch === "A4" && family === "POE-2 / TF4") idPrefix = prefix.replace(/^TF4[-_]?/, "");
  if (batch === "A4" && family === "POE-3 / Cybrid T22") idPrefix = prefix.replace(/^Cyb/, "");
  if (batch === "A4" && family === "TPO-2 / Lenzing") idPrefix = prefix.replace(/^Len/, "");
  const candidates = inventory.samples.filter(sample => sample.batch_no_raw === batch && sample.material_family === family && String(sample.sample_id_raw).startsWith(`${idPrefix}_R`));
  if (candidates.length !== 1) throw Error(`Direct source has ${candidates.length} sample candidates: ${source} (${idPrefix})`);
  const sample = candidates[0];
  const observations = observationsBySample.get(sample.sample_uid).filter(row => row.test_type === type && (duration === undefined || row.exposure_duration_numeric === duration));
  if (observations.length !== 1) throw Error(`Direct source has ${observations.length} stage candidates: ${source}`);
  return { sample, observation: observations[0], type, duration: duration ?? observations[0].exposure_duration_numeric };
};
async function walk(directory) {
  const result = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(full));
    else if (entry.isFile()) result.push(full);
  }
  return result;
}
let fileNumber = 410, measurementNumber = 5117;
const newFiles = (await walk(raw)).filter(file => file.endsWith(".xls") && !("IV/" + path.relative(raw, file).split(path.sep).join("/") in registry.rawHashes)).sort();
const fileAudit = [];
for (const file of newFiles) {
  const source = "IV/" + path.relative(raw, file).split(path.sep).join("/");
  const bytes = await fs.readFile(file);
  registry.rawHashes[source] = sha(bytes);
  const linked = direct(source);
  const reference = source.includes("/Non-encapsulés/");
  const kind = linked ? "matched_filename" : reference ? "reference_unassigned" : "unmatched";
  const file_uid = `FIL-${String(fileNumber++).padStart(4, "0")}`;
  const decision = { file_uid, sample_uid: linked?.sample.sample_uid ?? null, match_status: kind, match_score: null, second_best_score: null, match_margin: null,
    match_reasons: linked ? "unique_batch_material_sample_token_and_protocol" : reference ? "pre_encapsulation_R_reference_not_uniquely_adjudicated" : "historical_cell_identity_not_independently_adjudicated",
    matched_observation_uid: linked?.observation.observation_uid ?? null, matched_measurement_sheet: null, metric_fields_tight: null, metric_mean_normalized_diff: null,
    inferred_test_type: linked?.type ?? (reference ? "Unknown" : source.includes("OldTC") ? "TC" : "DH"), inferred_exposure_duration: linked?.duration ?? null,
    inferred_exposure_unit: linked?.type === "TC" ? "cycles" : linked?.type === "DH" ? "h" : null,
    material_family_inferred: linked?.sample.material_family ?? "Unclassified" };
  registry.matching.push({ target: source, oldValue: null, decision, reason: linked ? "Unique explicit batch, material and sample code in path; stage confirmed by Summary_v3. Filename-based, not a laboratory-adjudicated match." : "Raw source retained; identity is not unique enough for quantitative linkage.", source: "2026-09-25 intake: source path + Summary_v3 inventory", status: linked ? "provisional_filename_match" : "requires_review" });
  const workbook = XLSX.read(bytes, { type: "buffer" });
  let registered = 0;
  for (const [sheet_index, sheet_name] of workbook.SheetNames.entries()) {
    const sheet = workbook.Sheets[sheet_name];
    if (!String(sheet.B1?.v ?? "").includes("IV measurement of")) throw Error(`Not a recognised JV sheet: ${source}:${sheet_name}`);
    const headerV = String(sheet.BA5?.v ?? ""), headerJ = String(sheet.BB5?.v ?? "");
    if (!headerV.startsWith("V") || !/[IJ]/.test(headerJ)) throw Error(`No series-0 IV columns: ${source}:${sheet_name}`);
    registry.measurementIds.push({ measurement_uid: `MEA-${String(measurementNumber++).padStart(5, "0")}`, file_uid, source_file: source, sheet_name, sheet_index, curve_series_index: 0 });
    registered++;
  }
  fileAudit.push({ source, file_uid, status: kind, sample_uid: decision.sample_uid, measurementSheets: registered });
}
if (newFiles.length !== 59) throw Error(`Expected 59 new .xls sources; found ${newFiles.length}`);
validateDecisionRegistry(registry);
await fs.copyFile(path.join(raw, "Summary_v3.xlsx"), path.join(raw, "Summary.xlsx"));
await fs.writeFile(registryPath, JSON.stringify(registry, null, 2) + "\n");
const auditPath = path.join(root, "data/decisions/intake-2026-09-25.json");
await fs.writeFile(auditPath, JSON.stringify({ source: "IV/Summary_v3.xlsx", sourceSha256: sha(nextBytes), counts: changes, files: fileAudit }, null, 2) + "\n");
console.log(JSON.stringify({ counts: { ...changes, sourceValueChanges: changes.sourceValueChanges.length }, newFiles: newFiles.length, newMeasurements: measurementNumber - 5117, fileStatus: Object.fromEntries([...new Set(fileAudit.map(item => item.status))].map(status => [status, fileAudit.filter(item => item.status === status).length])) }));
