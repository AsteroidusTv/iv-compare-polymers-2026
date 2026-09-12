import assert from "node:assert/strict";
import test from "node:test";

import { describeGraphElectrode, describeSeriesSelection, describeTrendExport, pointsThrough, uniqueLegendEntries } from "../app/lib/chart-export";

test("graph legends contain one entry per material series", () => {
  const series = [
    { label: "A1 · Silicone 1", exportLegendKey: "a" },
    { label: "A2 · Silicone 2", exportLegendKey: "a" },
    { label: "B1 · EVA 1", exportLegendKey: "b" },
  ];

  assert.deepEqual(uniqueLegendEntries(series), [series[0], series[2]]);
});

test("graph exports mention only silver electrodes", () => {
  assert.equal(describeGraphElectrode(["Cu", "Cu", null]), undefined);
  assert.equal(describeGraphElectrode(["Cu", " Ag "]), "Ag electrode");
});

test("graph-end limits keep only observations at or before the boundary", () => {
  const points = [{ x: 1_000 }, { x: 1_500 }, { x: 2_000 }];

  assert.deepEqual(pointsThrough(points, 1_500), [{ x: 1_000 }, { x: 1_500 }]);
  assert.deepEqual(pointsThrough([{ x: 1_000 }, { x: 2_000 }], 1_500), [{ x: 1_000 }]);
  assert.deepEqual(pointsThrough(points, null), points);
});

test("individual specimen exports do not claim an aggregate or n=1", () => {
  const points = [
    { n: 1, selectedLabel: "Cell 1 · Ref A" },
    { n: 1, selectedLabel: "Cell 1 · Ref A" },
  ];
  const summary = describeTrendExport(points, "Mean with 95% CI when estimable");

  assert.equal(summary.mode, "individual");
  assert.equal(summary.subtitle, "Individual specimen trajectories · one line per specimen · no aggregation");
  assert.doesNotMatch(summary.subtitle, /mean|median|n=1/i);
  assert.equal(describeSeriesSelection(points, summary.mode), "Individual specimen · Cell 1 · Ref A");
});

test("aggregate exports retain their estimator and sample-size range", () => {
  const summary = describeTrendExport([{ n: 2 }, { n: 4 }], "Median with IQR when estimable");

  assert.equal(summary.mode, "aggregate");
  assert.equal(summary.subtitle, "Median with IQR when estimable · n=2–4 per series and duration");
});

test("mixed exports identify both observation types and only count aggregate points", () => {
  const summary = describeTrendExport(
    [{ n: 1, selectedLabel: "Cell 1 · Ref A" }, { n: 3 }],
    "Mean with 95% CI when estimable",
  );

  assert.equal(summary.mode, "mixed");
  assert.match(summary.subtitle, /individual observations and aggregate values/);
  assert.match(summary.subtitle, /aggregates: Mean with 95% CI when estimable; n=3/);
  assert.doesNotMatch(summary.subtitle, /n=1/);
});
