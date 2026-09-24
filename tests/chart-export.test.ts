import assert from "node:assert/strict";
import test from "node:test";

import { describeGraphElectrode, describeSeriesSelection, legendSelectionsByKey, pointsThrough, showTrendMarkers, trendExportScaleWarning, uniqueLegendEntries } from "../app/lib/chart-export";

test("dense daily curves keep their data points but omit decorative markers", () => {
  assert.equal(showTrendMarkers("days", 100), false);
  assert.equal(showTrendMarkers("days", 28), true);
  assert.equal(showTrendMarkers("h", 100), true);
});

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

test("individual specimen legends omit laboratory identifiers", () => {
  const points = [
    { n: 1, selectedLabel: "Cell 1 · Ref A" },
    { n: 1, selectedLabel: "Cell 1 · Ref A" },
  ];
  assert.equal(describeSeriesSelection(points), "Individual specimen");
  assert.equal(describeSeriesSelection([{ n: 1, selectedLabel: "Cell 1" }, { n: 1, selectedLabel: "Cell 2" }]), "2 individual specimens");
});

test("shared material legend counts distinct individual specimens", () => {
  const series = [
    { label: "POE-2 / TF4", exportLegendKey: "tf4", points: [{ n: 1, selectedLabel: "Cell 3 · Ref 2" }] },
    { label: "POE-2 / TF4", exportLegendKey: "tf4", points: [{ n: 1, selectedLabel: "Cell 4 · Ref 2" }] },
    { label: "EVA", exportLegendKey: "eva", points: [{ n: 3 }] },
  ];
  assert.deepEqual([...legendSelectionsByKey(series)], [["tf4", "2 individual specimens"], ["eva", "Aggregate values"]]);
});

test("aggregate legends state only the display type", () => {
  assert.equal(describeSeriesSelection([{ n: 2 }, { n: 4 }]), "Aggregate values");
});

test("mixed exports describe each series without a redundant global subtitle", () => {
  assert.equal(describeSeriesSelection([{ n: 1, selectedLabel: "Cell 1 · Ref A" }, { n: 3 }]), "Individual specimen and aggregate values");
  assert.equal(trendExportScaleWarning(false, true), "");
  assert.equal(trendExportScaleWarning(false, false), "");
  assert.equal(trendExportScaleWarning(true, false), "Some values extend beyond the y-axis");
  assert.equal(trendExportScaleWarning(true, true), "Some values or intervals extend beyond the y-axis");
});
