import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import zlib from "node:zlib";
import type { IVDataset } from "../app/lib/iv-data";
import { ageingSampleCandidates, defaultAgeingTimes, resolveAgeingTimes, toggleAgeingTime } from "../app/lib/iv-ageing";

test("ageing evolution offers only the same physical cell at multiple exact times", () => {
  const dataset: IVDataset = JSON.parse(zlib.gunzipSync(fs.readFileSync("public/data/iv-compare-dowsil.ivpack")).toString());
  const config = { id: "a", material: "EVA", stress: "DH", metric: "efficiency_pct" as const, electrode: "all", recipe: "all" };
  const candidates = ageingSampleCandidates(dataset, config, false);
  assert.ok(candidates.length > 0);
  const inspectionCandidates = ageingSampleCandidates(dataset, config, false, true);
  assert.ok(inspectionCandidates.length >= candidates.length);
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

test("reviewed low3 TC500 source is available with original sweep values", () => {
  const dataset: IVDataset = JSON.parse(zlib.gunzipSync(fs.readFileSync("public/data/iv-compare-dowsil.ivpack")).toString());
  const config = {id:"pdms",material:"Silicone / PDMS",stress:"TC",metric:"efficiency_pct" as const,electrode:"all",recipe:"all"};
  const candidate = ageingSampleCandidates(dataset, config, false).find(item=>item.sampleUid==="SMP-051");
  const stage = candidate?.times.find(item=>item.time===500);
  assert.ok(stage, "TC500 must appear without enabling unsafe inspection or QA-flagged data");
  assert.equal(stage.files.length,1);
  assert.equal(stage.files[0].matched_observation_uid,"OBS-0373");
  const sweep = stage.measurements.find(item=>item.measurement_uid==="MEA-05596");
  assert.ok(sweep);
  assert.equal(sweep.sheet_name,"exp1_3");
  assert.equal(sweep.efficiency_pct,9.275723);
  assert.equal(sweep.ff_pct,37.03645);
  const allSweeps = dataset.measurements.filter(item=>item.file_uid==="FIL-0454");
  assert.equal(allSweeps.length,10);
  assert.ok(allSweeps.every(item=>item.sample_uid==="SMP-051"));
  assert.equal(dataset.observations.find(item=>item.observation_uid==="OBS-0373")?.efficiency_pct,9.3);
});
