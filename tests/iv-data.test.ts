import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";

import { validateDataset, type IVDataset } from "../app/lib/iv-data";

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

test("the shipped package satisfies the complete dataset invariants", () => {
  const payload = JSON.parse(gunzipSync(fs.readFileSync(new URL("../public/data/iv-compare-dowsil.ivpack", import.meta.url))).toString("utf8"));
  const dataset = validateDataset(payload);
  assert.equal(dataset.schemaVersion, "1.2");
  assert.equal(dataset.report.points, 743_140);
  assert.equal(dataset.provenance?.pipelineVersion, "2.0.0");
});
