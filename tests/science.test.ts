import assert from "node:assert/strict";
import test from "node:test";

import type { Measurement, Observation } from "../app/lib/iv-data";
import { chooseRepresentativeMeasurement, measurementQualityReasons, outdoorBaseline, outdoorQualityReason, summarise } from "../app/lib/science";

function measurement(uid: string, efficiency: number, overrides: Partial<Measurement> = {}): Measurement {
  return { measurement_uid: uid, file_uid: "FIL-1", match_status: "matched_high", efficiency_pct: efficiency, point_count: 100, ...overrides };
}

test("mean reports a 95% confidence interval and median reports an IQR", () => {
  const mean = summarise([10, 12, 14, 16], "mean");
  assert.equal(mean.value, 13);
  assert.equal(mean.intervalLabel, "95% CI");
  assert.ok(mean.intervalLow < mean.value && mean.intervalHigh > mean.value);
  const median = summarise([1, 2, 3, 100], "median");
  assert.equal(median.value, 2.5);
  assert.equal(median.intervalLabel, "IQR");
  assert.deepEqual([median.intervalLow, median.intervalHigh], [1.75, 27.25]);
});

test("representative IV selection is closest to the median, never the maximum", () => {
  const selected = chooseRepresentativeMeasurement([measurement("low", 10), measurement("middle", 12), measurement("high", 40)]);
  assert.equal(selected?.measurement_uid, "middle");
});

test("physical QA catches unflagged pathological IV values", () => {
  assert.deepEqual(measurementQualityReasons(measurement("bad", 56_445, { voc_V: -663_186.6 })), ["efficiency outside 0–50%", "Voc outside 0–5 V"]);
});

test("outdoor baseline needs three days and reports window sensitivity", () => {
  assert.equal(outdoorBaseline([90, 91]).value, null);
  const stable = outdoorBaseline([100, 101, 99, 100, 102, 98, 100, 100, 99, 101, 100, 100, 100, 100]);
  assert.equal(stable.value, 100);
  assert.ok((stable.sensitivityPct ?? Infinity) < 5);
});

test("outdoor QA detects a physically impossible PR", () => {
  const observation: Observation = { observation_uid: "OBS-1", sample_uid: "SMP-1", test_type: "Outdoor", exposure_duration_numeric: 5, outdoor_pr_pct: 570 };
  assert.match(outdoorQualityReason(observation, "outdoor_pr_pct", []) ?? "", /0–150%/);
});

test("small n median has no box; explicit mean CI remains untruncated", () => {
  const two = summarise([60, 120], "median");
  assert.equal(two.intervalLabel, "single value");
  assert.equal(two.intervalLow, two.intervalHigh);
  assert.ok(summarise([60, 120], "mean").intervalHigh > 450);
});

test("Outdoor dropout recovery requires positive valid neighbours on both sides", () => {
  const observation: Observation = { observation_uid: "o", sample_uid: "s", test_type: "Outdoor", exposure_duration_numeric: 10, outdoor_pmpp_W: 0.1 };
  const peers = [1, 2, 3, 4, 8, 9].map((time) => ({ time, value: 10 }));
  assert.equal(outdoorQualityReason(observation, "outdoor_pmpp_W", peers), null);
  assert.match(outdoorQualityReason(observation, "outdoor_pmpp_W", [...peers, { time: 11, value: 10 }]) ?? "", /recovery/);
});

test("Outdoor day-0 startup dropout needs two stable recovery days", () => {
  const first: Observation = { observation_uid: "first", sample_uid: "s", test_type: "Outdoor", exposure_duration_numeric: 0, outdoor_pr_pct: 0.06 };
  assert.match(outdoorQualityReason(first, "outdoor_pr_pct", [{ time: 0, value: 0.06 }, { time: 1, value: 78 }, { time: 2, value: 80 }]) ?? "", /Installation-day dropout/);
  assert.equal(outdoorQualityReason(first, "outdoor_pr_pct", [{ time: 0, value: 0.06 }, { time: 1, value: 78 }]), null);
  assert.equal(outdoorQualityReason(first, "outdoor_pr_pct", [{ time: 0, value: 0.06 }, { time: 1, value: 0.1 }, { time: 2, value: 0.2 }]), null);
});

test("Outdoor B3/B7/B14 are explicit windows with minimum three valid observations", () => {
  const values = Array.from({ length: 14 }, (_, i) => i + 1);
  assert.equal(outdoorBaseline(values, 3).value, 2);
  assert.equal(outdoorBaseline(values, 7).value, 4);
  assert.equal(outdoorBaseline(values, 14).value, 7.5);
  assert.equal(outdoorBaseline([1, 2], 14).value, null);
  assert.equal(outdoorBaseline([1, 2, 3], 14).count, 3);
});
