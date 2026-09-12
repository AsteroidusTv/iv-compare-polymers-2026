import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import zlib from "node:zlib";
import { boxStatistics, encapsulationGroups } from "../app/lib/encapsulation";
import type { IVDataset, Observation, Sample } from "../app/lib/iv-data";

test("pairs use the same cell, preserve zero after and separate batches/formulations", () => {
  const samples: Sample[] = [
    { sample_uid: "a", material_family: "EVA", material_raw: "406", batch_no_raw: "A1", initial_efficiency_pct: 10 },
    { sample_uid: "b", material_family: "EVA", material_raw: "806", batch_no_raw: "A1", initial_efficiency_pct: 12 },
    { sample_uid: "c", material_family: "EVA", material_raw: "806", batch_no_raw: "A2", initial_efficiency_pct: 14 },
    { sample_uid: "missing", material_family: "EVA" },
  ];
  const observations: Observation[] = samples.slice(0, 3).map((sample, i) => ({ observation_uid: String(i), sample_uid: sample.sample_uid, test_type: "Unaged", efficiency_pct: i }));
  const result = encapsulationGroups(samples, observations, ["EVA", "EVA"]);
  assert.equal(result.groups.length, 3);
  assert.equal(result.groups[0].pairs[0].after, 0);
  assert.equal(result.excluded, 1);
  assert.equal(encapsulationGroups(samples, [...observations, observations[0]], ["EVA"]).groups.length, 2);
  assert.equal(encapsulationGroups(samples, observations.map((o) => ({ ...o, data_quality_flag: "review" })), ["EVA"]).groups.length, 0);
  assert.equal(encapsulationGroups(samples, observations, ["Other"]).groups.length, 0);
});

test("box whiskers exclude outliers and quartiles use linear interpolation", () => {
  assert.deepEqual(boxStatistics([1, 2, 3, 4, 100]), { q1: 2, median: 3, q3: 4, low: 1, high: 4 });
  assert.deepEqual(boxStatistics([1, 2, 3, 4]), { q1: 1.75, median: 2.5, q3: 3.25, low: 1, high: 4 });
});

test("supplied package has 35 eligible encapsulation pairs", () => {
  const dataset: IVDataset = JSON.parse(zlib.gunzipSync(fs.readFileSync("public/data/iv-compare-dowsil.ivpack")).toString());
  const result = encapsulationGroups(dataset.samples, dataset.observations, dataset.samples.map((sample) => sample.material_family));
  assert.equal(result.groups.reduce((count, group) => count + group.pairs.length, 0), 35);
  assert.ok(result.groups.every((group) => group.pairs.length > 0));
});
