import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

import XLSX from "xlsx";
import { gunzipSync } from "node:zlib";
import { loadLightAgeing } from "./light-ageing.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rawRoot = path.join(root, "data", "raw");
const processedRoot = path.join(root, "data", "processed");

function rows(workbook, sheetName, options = {}) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Missing sheet ${sheetName}`);
  return XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true, ...options });
}

function comparable(value) {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) return String(Math.round((value.getTime() - Date.UTC(1899, 11, 30)) / 86_400_000));
  return String(value).trim();
}

async function lineCountsByFile(tsvPath, fileColumn, uidColumn = null) {
  const counts = new Map();
  const uids = new Map();
  const input = createReadStream(tsvPath, { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let header = null;
  for await (const line of lines) {
    if (!header) {
      header = line.split("\t");
      continue;
    }
    if (!line) continue;
    const cells = line.split("\t");
    const source = cells[header.indexOf(fileColumn)];
    counts.set(source, (counts.get(source) ?? 0) + 1);
    if (uidColumn) {
      const uid = cells[header.indexOf(uidColumn)];
      uids.set(uid, (uids.get(uid) ?? 0) + 1);
    }
  }
  return { counts, uids, total: [...counts.values()].reduce((sum, count) => sum + count, 0) };
}

function closeEnough(left, right, tolerance = 1e-6) {
  if (left === null || left === undefined || left === "") return right === null || right === undefined || right === "";
  if (right === null || right === undefined || right === "") return false;
  const a = Number(left);
  const b = Number(right);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b));
}

async function readProcessedCurves() {
  const curves = new Map();
  const input = createReadStream(path.join(processedRoot, "IV_curve_points.tsv"), { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let header = null;
  for await (const line of lines) {
    if (!header) {
      header = line.split("\t");
      continue;
    }
    if (!line) continue;
    const cells = line.split("\t");
    const uid = cells[header.indexOf("measurement_uid")];
    const curve = curves.get(uid) ?? { v: [], j: [] };
    curve.v.push(Number(cells[header.indexOf("voltage_V")]));
    curve.j.push(Number(cells[header.indexOf("generated_current_density_mA_cm2")]));
    curves.set(uid, curve);
  }
  return curves;
}

async function readProcessedOutdoor() {
  const recordsByFile = new Map();
  const input = createReadStream(path.join(processedRoot, "Outdoor_raw_measurements.tsv"), { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let header = null;
  for await (const line of lines) {
    if (!header) {
      header = line.split("\t");
      continue;
    }
    if (!line) continue;
    const cells = line.split("\t");
    const record = Object.fromEntries(header.map((column, index) => [column, cells[index] ?? ""]));
    const group = recordsByFile.get(record.source_file) ?? [];
    group.push(record);
    recordsByFile.set(record.source_file, group);
  }
  return recordsByFile;
}

function canonicalTimestamp(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const isoLike = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (isoLike) return `${isoLike[1]}-${isoLike[2]}-${isoLike[3]} ${isoLike[4].padStart(2,"0")}:${isoLike[5]}:${isoLike[6] ?? "00"}`;
  const usDate = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (usDate) {
    const [, month, day, year, hour, minute, second = "00"] = usDate;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")} ${hour.padStart(2, "0")}:${minute}:${second}`;
  }
  throw new Error(`Unsupported Outdoor timestamp format: ${text}`);
}

async function deepVerifyOutdoor(files) {
  const processedByFile = await readProcessedOutdoor();
  let verifiedRows = 0;
  for (const file of files) {
    const source = String(file.source_file);
    const rawWorkbook = XLSX.read(await fs.readFile(path.join(rawRoot, source), "utf8"), { type: "string", raw: true });
    const rawSheet = rawWorkbook.Sheets[rawWorkbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(rawSheet, { defval: null, raw: true });
    const processedRows = processedByFile.get(source) ?? [];
    if (rawRows.length !== processedRows.length) throw new Error(`Deep Outdoor row count mismatch for ${source}.`);

    for (let index = 0; index < rawRows.length; index += 1) {
      const raw = rawRows[index];
      const processed = processedRows[index];
      const standard = String(file.source_schema) === "logger_standard";
      const timestamp = standard ? raw.Time : (raw.RecTime ?? raw.time);
      const comparisons = standard
        ? [
            ["irradiance_W_m2", raw.Irr],
            ["performance_ratio_pct", raw.PR],
            ["pmpp_W", raw.Pmpp],
            ["impp_A", null],
            ["umpp_V", null],
          ]
        : [
            ["irradiance_W_m2", raw.Irr],
            ["performance_ratio_pct", null],
            ["pmpp_W", raw.Pmpp ?? raw.pmpp],
            ["impp_A", raw.Impp ?? raw.impp],
            ["umpp_V", raw.Umpp ?? raw.umpp],
          ];

      if (Number(processed.source_row) !== index + 2) throw new Error(`Outdoor source row mismatch for ${source} at row ${index + 2}.`);
      if (processed.source_schema !== String(file.source_schema)) throw new Error(`Outdoor schema mismatch for ${source} at row ${index + 2}.`);
      if (processed.timestamp !== canonicalTimestamp(timestamp)) throw new Error(`Outdoor timestamp mismatch for ${source} at row ${index + 2}.`);
      for (const [column, expected] of comparisons) {
        if (!closeEnough(processed[column], expected)) throw new Error(`Outdoor value mismatch for ${source} at row ${index + 2}, column ${column}.`);
      }
      verifiedRows += 1;
    }
  }
  return verifiedRows;
}

async function deepVerifyIV(files, measurements) {
  const processedCurves = await readProcessedCurves();
  const measurementsByFile = new Map();
  measurements.forEach((measurement) => {
    const group = measurementsByFile.get(measurement.file_uid) ?? [];
    group.push(measurement);
    measurementsByFile.set(measurement.file_uid, group);
  });
  let verifiedPoints = 0;
  for (const [fileIndex, file] of files.entries()) {
    const workbook = XLSX.read(await fs.readFile(path.join(rawRoot, String(file.source_file))), { type: "buffer", raw: true });
    for (const measurement of measurementsByFile.get(file.file_uid) ?? []) {
      const sheet = workbook.Sheets[String(measurement.sheet_name)];
      if (!sheet) throw new Error(`Missing raw sheet ${measurement.sheet_name} in ${file.source_file}.`);
      const seriesIndex = Number(measurement.curve_series_index ?? 0);
      const summaryRow = 6 + seriesIndex;
      const summaryFields = [
        ["D", measurement.cell_area_cm2, 1],
        ["E", measurement.jsc_mA_cm2, 1],
        ["F", measurement.voc_V, 0.001],
        ["G", measurement.ff_pct, 1],
        ["H", measurement.efficiency_pct, 1],
      ];
      for (const [column, expected, scale] of summaryFields) {
        const rawValue = sheet[`${column}${summaryRow + 1}`]?.v;
        if (!closeEnough(expected, rawValue === undefined ? null : Number(rawValue) * Number(scale))) {
          throw new Error(`Raw summary mismatch for ${measurement.measurement_uid} at ${column}${summaryRow + 1}.`);
        }
      }
      const voltageColumn = 52 + seriesIndex * 2;
      const currentColumn = voltageColumn + 1;
      const voltageScale = Number(measurement.curve_voltage_scale_to_V ?? 0.001);
      const area = Number(measurement.cell_area_cm2);
      const densitySource = Boolean(measurement.current_values_are_density);
      const expectedCurve = processedCurves.get(String(measurement.measurement_uid));
      if (Number(measurement.point_count ?? 0) === 0) {
        if (expectedCurve) throw new Error(`Unexpected processed curve ${measurement.measurement_uid} for a zero-point measurement.`);
        continue;
      }
      if (!expectedCurve) throw new Error(`Missing processed curve ${measurement.measurement_uid}.`);
      let pointIndex = 0;
      for (let rawRow = 5; ; rawRow += 1) {
        const voltageCell = sheet[XLSX.utils.encode_cell({ r: rawRow, c: voltageColumn })]?.v;
        const currentCell = sheet[XLSX.utils.encode_cell({ r: rawRow, c: currentColumn })]?.v;
        if (!Number.isFinite(Number(voltageCell)) || !Number.isFinite(Number(currentCell))) break;
        const voltage = Number(voltageCell) * voltageScale;
        const currentDensity = densitySource ? Number(currentCell) : Number(currentCell) / area;
        if (!closeEnough(expectedCurve.v[pointIndex], voltage) || !closeEnough(expectedCurve.j[pointIndex], -currentDensity)) {
          throw new Error(`Raw IV point mismatch for ${measurement.measurement_uid} at point ${pointIndex + 1}.`);
        }
        pointIndex += 1;
      }
      if (pointIndex !== expectedCurve.v.length) throw new Error(`Raw IV point count mismatch for ${measurement.measurement_uid}: ${pointIndex} vs ${expectedCurve.v.length}.`);
      verifiedPoints += pointIndex;
    }
    if ((fileIndex + 1) % 25 === 0) process.stderr.write(`Verified ${fileIndex + 1}/${files.length} raw IV files\n`);
  }
  return verifiedPoints;
}

async function main() {
  const rawInventory = XLSX.read(await fs.readFile(path.join(rawRoot, "IV", "Summary.xlsx")), { type: "buffer", cellDates: true, raw: true });
  const normalized = XLSX.read(await fs.readFile(path.join(processedRoot, "IV_dataset_normalise_Outdoor.xlsx")), { type: "buffer", cellDates: true, raw: true });

  const sourceRows = rows(normalized, "Source_Rows");
  const rawRowsBySheet = new Map(rawInventory.SheetNames.map((sheetName) => [sheetName, rows(rawInventory, sheetName, { header: 1 })]));
  const sourceHeaders = Object.keys(sourceRows[0] ?? {}).filter((key) => key.startsWith("col_"));
  let omittedSourceCells = 0;
  for (const sourceRow of sourceRows) {
    const sourceSheet = String(sourceRow.source_inventory_sheet ?? "Lami-results");
    const raw = (rawRowsBySheet.get(sourceSheet) ?? [])[Number(sourceRow.source_inventory_row) - 1] ?? [];
    sourceHeaders.forEach((header, index) => {
      const processedValue = comparable(sourceRow[header]);
      const rawValue = comparable(raw[index]);
      if (!processedValue && rawValue) {
        omittedSourceCells += 1;
        return;
      }
      if (processedValue !== rawValue) {
        throw new Error(`Source_Rows mismatch at inventory row ${sourceRow.source_inventory_row}, column ${index + 1}.`);
      }
    });
  }

  const files = rows(normalized, "IV_Files");
  const measurements = rows(normalized, "IV_Measurements");
  for (const file of files) await fs.access(path.join(rawRoot, String(file.source_file)));

  const pointAudit = await lineCountsByFile(path.join(processedRoot, "IV_curve_points.tsv"), "source_file", "measurement_uid");
  for (const measurement of measurements) {
    const actual = pointAudit.uids.get(String(measurement.measurement_uid)) ?? 0;
    if (actual !== Number(measurement.point_count)) throw new Error(`Point count mismatch for ${measurement.measurement_uid}: ${actual} vs ${measurement.point_count}.`);
  }
  if (pointAudit.total !== measurements.reduce((sum, measurement) => sum + Number(measurement.point_count ?? 0), 0)) throw new Error("Total IV point count does not reconcile.");

  const outdoorFiles = rows(normalized, "Outdoor_Files");
  const outdoorAudit = await lineCountsByFile(path.join(processedRoot, "Outdoor_raw_measurements.tsv"), "source_file");
  for (const file of outdoorFiles) {
    const source = String(file.source_file);
    await fs.access(path.join(rawRoot, source));
    const actual = outdoorAudit.counts.get(source) ?? 0;
    if (actual !== Number(file.raw_row_count)) throw new Error(`Outdoor row count mismatch for ${source}: ${actual} vs ${file.raw_row_count}.`);
  }

  const deep = process.argv.includes("--deep");
  const light = await loadLightAgeing(root, rows(normalized, "Samples"));
  if (light.observations.length) {
    const processed = JSON.parse(await fs.readFile(path.join(processedRoot, "Light_ageing_Pearl.json"), "utf8"));
    const pack = JSON.parse(gunzipSync(await fs.readFile(path.join(processedRoot, "IV_Compare_DOWSIL.ivpack"))).toString());
    if (JSON.stringify(processed) !== JSON.stringify(light.observations)
      || JSON.stringify(pack.observations.filter(row => row.test_type === "Light ageing")) !== JSON.stringify(light.observations)) {
      throw Error("Pearl observations do not reproduce their raw source rows.");
    }
  }
  const deepIVPointsVerified = deep ? await deepVerifyIV(files, measurements) : null;
  const deepOutdoorRowsVerified = deep ? await deepVerifyOutdoor(outdoorFiles) : null;

  console.log(JSON.stringify({
    inventorySourceRowsVerified: sourceRows.length,
    inventorySourceCellsOmittedFromFlatAuditCopy: omittedSourceCells,
    ivFilesVerified: files.length,
    ivMeasurementsVerified: measurements.length,
    ivPointsVerified: pointAudit.total,
    outdoorFilesVerified: outdoorFiles.length,
    outdoorRowsVerified: outdoorAudit.total,
    lightAgeingRowsVerified: light.observations.length,
    deepIVPointsVerified,
    deepOutdoorRowsVerified,
  }, null, 2));
}

await main();
