import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import zlib from "node:zlib";
import type { IVDataset } from "../app/lib/iv-data";
import { ageingSampleCandidates, defaultAgeingTimes, resolveAgeingTimes, toggleAgeingTime } from "../app/lib/iv-ageing";

test("ageing evolution offers only the same physical cell at multiple exact times", () => {
  const dataset: IVDataset = JSON.parse(zlib.gunzipSync(fs.readFileSync("public/data/iv-compare-dowsil.ivpack")).toString());
  const config = { id: "a", material: "EVA", stress: "DH", metric: "efficiency_pct" as const, electrode: "all", recipe: "all" };
  assert.equal(ageingSampleCandidates(dataset, config, false).length, 0, "Unresolved legacy units are not quantitatively validated");
  const candidates = ageingSampleCandidates(dataset, config, false, true);
  assert.ok(candidates.length > 0);
  assert.ok(candidates.every((candidate) => candidate.times.length >= 2));
  assert.ok(candidates.every((candidate) => candidate.times.every((time) => time.measurements.every((measurement) => measurement.sample_uid === candidate.sampleUid))));
  assert.ok(candidates.every((candidate) => candidate.times.every((time) => time.measurements.every((measurement) => dataset.files.find((file) => file.file_uid === measurement.file_uid)?.inferred_test_type === "Unaged" ? time.time === 0 : time.time > 0))));
});

test("time selection defaults to endpoints and always retains two curves", () => {
  assert.deepEqual(defaultAgeingTimes([0, 500, 1000]), [0, 1000]);
  assert.deepEqual(resolveAgeingTimes([0, 500, 1000], [500, 999]), [0, 1000]);
  assert.deepEqual(toggleAgeingTime([0, 1000], 0), [0, 1000]);
  assert.deepEqual(toggleAgeingTime([0, 500, 1000], 500), [0, 1000]);
  assert.deepEqual(toggleAgeingTime([0, 1000], 500), [0, 500, 1000]);
});
