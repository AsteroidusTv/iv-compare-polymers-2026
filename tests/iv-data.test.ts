import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";

import { asIsoDate, validateDataset, type IVDataset } from "../app/lib/iv-data";

function validDataset(): IVDataset {
  return {
    schemaVersion: "1.2",
    name: "test",
    report: { samples: 1, recipes: 0, observations: 1, files: 1, measurements: 1, points: 2, matchedFiles: 1, reviewFiles: 0 },
    samples: [{ sample_uid: "S-1", material_family: "POE" }],
    recipes: [],
    observations: [{ observation_uid: "O-1", sample_uid: "S-1", test_type: "Unaged", efficiency_pct: 10 }],
    files: [{ file_uid: "F-1", sample_uid: "S-1", match_status: "matched_high" }],
    measurements: [{ measurement_uid: "M-1", file_uid: "F-1", sample_uid: "S-1", match_status: "matched_high", point_count: 2 }],
    curves: { "M-1": { v: [0, 1], j: [-10, 0] } },
  };
}

test("dataset validation enforces referential integrity and curve counts", () => {
  assert.equal(validateDataset(validDataset()).report.points, 2);
  const orphan = validDataset();
  orphan.observations[0].sample_uid = "missing";
  assert.throws(() => validateDataset(orphan), /unknown sample/);
  const mismatch = validDataset();
  mismatch.curves["M-1"].j.pop();
  assert.throws(() => validateDataset(mismatch), /inconsistent voltage\/current arrays/);
});

test("Excel calendar dates keep their displayed day in positive UTC offsets", () => {
  const previousTimezone = process.env.TZ;
  process.env.TZ = "Europe/Zurich";
  try {
    const excelDate = new Date(2026, 8, 10);
    assert.equal(excelDate.toISOString().slice(0, 10), "2026-09-09");
    assert.equal(asIsoDate(excelDate), "2026-09-10");
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

test("the shipped package satisfies the complete dataset invariants", () => {
  const payload = JSON.parse(gunzipSync(fs.readFileSync(new URL("../public/data/iv-compare-dowsil.ivpack", import.meta.url))).toString("utf8"));
  const dataset = validateDataset(payload);
  assert.equal(dataset.schemaVersion, "1.2");
  assert.equal(dataset.report.points, 1_137_150);
  assert.equal(dataset.report.matchedFiles, 402);
  assert.equal(dataset.report.reviewFiles, 12);
  assert.equal(dataset.report.auditFiles, 54);
  assert.equal(dataset.provenance?.pipelineVersion, "2.4.1");
  assert.equal(dataset.files.filter((file) => file.reference_sample_uid).length, 27);
  assert.equal(dataset.samples.find((sample) => sample.sample_uid === "SMP-003")?.encapsulation_date, "2026-03-19");
  assert.equal(dataset.files.find((file) => file.file_uid === "FIL-0001")?.measurement_date, "2026-03-31");
  assert.equal(dataset.measurements.find((measurement) => measurement.measurement_uid === "MEA-00001")?.measurement_date, "2026-03-31");
  const adjudicated = ["ODD-00742", "ODD-00822", "ODD-00832", "ODD-00912"].map(id => dataset.observations.find(row => row.observation_uid === id)!);
  const expected = [0, 21.473999977111816, 0.00800000037997961, 26.552499771118164];
  adjudicated.forEach((row, index) => assert.ok(Math.abs(row.outdoor_pr_pct! - expected[index]) < 1e-6));
  assert.ok(adjudicated.every(row => row.data_quality_flag === "outdoor_pr_adjudicated_fault"));
  assert.ok(adjudicated.every(row => row.outdoor_pmpp_W !== null && row.outdoor_pmpp_W !== undefined));
});
