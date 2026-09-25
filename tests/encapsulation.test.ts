import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import zlib from "node:zlib";
import { boxStatistics, encapsulationCurvePairs, encapsulationGroups, meanPairedRelativeChange, neutralGroupLabels, pairedMeasurementDayRange } from "../app/lib/encapsulation";
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

test("encapsulation groups keep recorded lamination recipes separate", () => {
  const samples: Sample[] = [
    { sample_uid: "big", material_family: "TPO", material_raw: "TPO-1", batch_no_raw: "A2", recipe_uid: "big", recipe_raw: "CVF", initial_efficiency_pct: 17 },
    { sample_uid: "small", material_family: "TPO", material_raw: "TPO-1", batch_no_raw: "A2", recipe_uid: "small", recipe_raw: "CSEM2 SL", initial_efficiency_pct: 17 },
  ];
  const observations: Observation[] = samples.map((sample, index) => ({ observation_uid: `o${index}`, sample_uid: sample.sample_uid, test_type: "Unaged", efficiency_pct: 16 }));
  const result = encapsulationGroups(samples, observations, ["TPO"]);
  assert.equal(result.groups.length, 2);
  assert.deepEqual(result.groups.map((group) => group.recipe).sort(), ["CSEM2 SL", "CVF"]);
  const labels = neutralGroupLabels(result.groups);
  assert.deepEqual(result.groups.map((group) => labels.get(group.key)), ["Groupe 1", "Groupe 2"]);
  assert.ok([...labels.values()].every((label) => !label?.includes("CVF") && !label?.includes("CSEM2")));
  assert.equal(neutralGroupLabels(result.groups.slice(0, 1)).get(result.groups[0].key), null);
});

test("box whiskers exclude outliers and quartiles use linear interpolation", () => {
  assert.deepEqual(boxStatistics([1, 2, 3, 4, 100]), { q1: 2, median: 3, q3: 4, low: 1, high: 4 });
  assert.deepEqual(boxStatistics([1, 2, 3, 4]), { q1: 1.75, median: 2.5, q3: 3.25, low: 1, high: 4 });
});

test("relative PCE change is averaged from paired cell changes", () => {
  const pairs = [
    { sampleUid: "a", reference: "a", before: 10, after: 20, beforeMeasurementDate: null, encapsulationDate: null, afterMeasurementDates: [] },
    { sampleUid: "b", reference: "b", before: 20, after: 20, beforeMeasurementDate: null, encapsulationDate: null, afterMeasurementDates: [] },
  ];
  assert.equal(meanPairedRelativeChange(pairs), 50);
  assert.equal(meanPairedRelativeChange([{ ...pairs[0], before: 0 }]), null);
});

test("measurement interval reports the observed before-to-after day range", () => {
  const pair = { sampleUid: "a", reference: "a", before: 10, after: 9, beforeMeasurementDate: "2026-08-03", encapsulationDate: "2026-08-05", afterMeasurementDates: ["2026-08-10", "2026-08-11"] };
  assert.deepEqual(pairedMeasurementDayRange([pair]), { min: 7, max: 8 });
  assert.equal(pairedMeasurementDayRange([{ ...pair, beforeMeasurementDate: null }]), null);
});

test("supplied package has 46 eligible encapsulation pairs after the A4 intake", () => {
  const dataset: IVDataset = JSON.parse(zlib.gunzipSync(fs.readFileSync("public/data/iv-compare-dowsil.ivpack")).toString());
  const result = encapsulationGroups(dataset.samples, dataset.observations, dataset.samples.map((sample) => sample.material_family));
  assert.equal(result.groups.reduce((count, group) => count + group.pairs.length, 0), 46);
  assert.ok(result.groups.every((group) => group.pairs.length > 0));
  const lenzingA3 = result.groups.filter((group) => group.material === "TPO-2_Lenzing" && group.batch === "A3");
  assert.deepEqual(lenzingA3.map((group) => group.pairs.length).sort(), [4, 4]);
  assert.deepEqual([...neutralGroupLabels(lenzingA3).values()].sort(), ["Groupe 1", "Groupe 2"]);
  const curvePairs = encapsulationCurvePairs(dataset);
  assert.equal(curvePairs.length, 27);
  assert.ok(curvePairs.every((pair) => pair.beforeFile.reference_match_basis && pair.beforeMeasurement.file_uid === pair.beforeFile.file_uid));
  assert.deepEqual(
    [...new Set(curvePairs.map((pair) => pair.sample.batch_no_raw))].sort(),
    ["A1", "A2", "A3"],
  );
});
