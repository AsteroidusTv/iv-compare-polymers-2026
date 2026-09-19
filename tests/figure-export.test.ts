import test from "node:test";
import assert from "node:assert/strict";
import { figureCsv, figureManifest } from "../app/lib/figure-export";
import type { TrendSeries, CurveSeries } from "../app/components/Charts";

const base = {
  title: "Test", caption: "Measured values", context: { filters: { batch: "A1" } },
  xUnit: "h", yUnit: "%", analyticLimit: { maximumX: 1500, interpolation: "none" as const },
  viewport: { xMin: 0, xMax: 1500, yMin: 60, yMax: 120 }, intervalsVisible: true, display: {},
};
test("figure CSV enforces analytical end, retains clipped values and exact contributors", () => {
  const point = (x: number, y: number) => ({ x, y, n: 1, min: y, max: y, intervalLow: y, intervalHigh: y,
    intervalLabel: "single value" as const, members: [{ sampleUid: "S1", observationId: `O${x}`, sampleLabel: "Cell", sampleReference: "1", batchNo: "A1", value: y }] });
  const series: TrendSeries[] = [{ id: "S", label: "=untrusted()", color: "red", points: [point(1000, 10), point(1500, 100), point(1600, 110)] }];
  const manifest = figureManifest({ ...base, kind: "trend", series });
  const csv = figureCsv(manifest);
  assert.match(csv, /O1000/);
  assert.match(csv, /O1500/);
  assert.doesNotMatch(csv, /O1600/);
  assert.match(csv, /false/);
  assert.match(csv, /'=untrusted/);
  assert.equal(manifest.series[0].color, "red");
});
test("JV CSV exports actual V-J points, selected segment and original source index", () => {
  const series: CurveSeries[] = [{ id: "M1", label: "Before", color: "blue", linePattern: "8 5", segments: [{ id: "branch-1", isPrimary: true, points: [{ x: 0.5, y: -20, sourceIndex: 42 }] }] }];
  const csv = figureCsv(figureManifest({ ...base, kind: "jv", xUnit: "V", yUnit: "mA/cm²", series, analyticLimit: { maximumX: null, interpolation: "none" } }));
  assert.match(csv, /source_index/);
  assert.match(csv, /"42"/);
  assert.match(csv, /"-20"/);
  assert.match(csv, /branch-1/);
  assert.doesNotMatch(csv, /observation_id/);
});
