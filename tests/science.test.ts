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
