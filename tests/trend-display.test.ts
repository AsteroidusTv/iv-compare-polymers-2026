import assert from "node:assert/strict";
import test from "node:test";
import { constantCohortApplies, mixedTrendDisplayLabel, resolveTrendDisplays, selectDisplayedTrendSeries, trendDisplaySummary, validTrendAggregationOverrides } from "../app/lib/trend-display";
import { summarise } from "../app/lib/science";
import { figureCsv, figureManifest } from "../app/lib/figure-export";
import type { TrendSeries } from "../app/components/Charts";

test("aggregation can be disabled for one or multiple series without changing the others", () => {
  const ids = ["a", "b", "s2", "s3"];
  assert.deepEqual(resolveTrendDisplays(ids, "aggregate", { s2: false }), {
    a: "aggregate", b: "aggregate", s2: "samples", s3: "aggregate",
  });
  const mixed = resolveTrendDisplays(ids, "aggregate", { a: false, s2: false });
  assert.equal(trendDisplaySummary(mixed, "aggregate"), "mixed");
  assert.deepEqual(resolveTrendDisplays(ids, "aggregate", {}), Object.fromEntries(ids.map(id => [id, "aggregate"])));
  assert.equal(trendDisplaySummary(resolveTrendDisplays(ids, "samples", {}), "samples"), "samples");
});

test("only TF4 can be aggregated when the global default is individual cells", () => {
  assert.deepEqual(resolveTrendDisplays(["a", "b", "s2"], "samples", { s2: true }), {
    a: "samples", b: "samples", s2: "aggregate",
  });
});

test("overrides use stable IDs through reordering; newly added series inherit the default", () => {
  assert.deepEqual(resolveTrendDisplays(["s3", "s2", "a", "s4"], "aggregate", { s2: false, b: false }), {
    s3: "aggregate", s2: "samples", a: "aggregate", s4: "aggregate",
  });
  assert.equal(trendDisplaySummary({}, "samples"), "samples");
});

test("mixed plots retain selected individual values, existing summary groups and parent order without duplicates", () => {
  const samples = [
    { id: "a::cell1", parentSeriesId: "a", values: [100, 90] },
    { id: "a::cell2", parentSeriesId: "a", values: [100, 40] },
    { id: "s2::cell3", parentSeriesId: "s2", values: [100, 80] },
    { id: "s2::cell4", parentSeriesId: "s2", values: [100, 60] },
  ];
  const aggregates = [
    { id: "a::group:batch1", parentSeriesId: "a", values: [100, 90] },
    { id: "a::group:batch2", parentSeriesId: "a", values: [100, 40] },
    { id: "s2::group:batch3", parentSeriesId: "s2", values: [100, summarise([80, 60], "median").value] },
  ];
  const result = selectDisplayedTrendSeries(["a", "s2"], { a: "samples", s2: "aggregate" }, samples, aggregates);
  assert.deepEqual(result.map(series => series.id), ["a::cell1", "a::cell2", "s2::group:batch3"]);
  assert.deepEqual(result.map(series => series.values[1]), [90, 40, 70]);
  assert.equal(result[0], samples[0]);
  const converse = selectDisplayedTrendSeries(["s2", "a"], { a: "aggregate", s2: "samples" }, samples, aggregates);
  assert.deepEqual(converse.map(series => series.id), ["s2::cell3", "s2::cell4", "a::group:batch1", "a::group:batch2"]);
});

test("constant-cohort restrictions affect summaries but never individual trajectories", () => {
  assert.equal(constantCohortApplies("aggregate", "constant"), true);
  assert.equal(constantCohortApplies("samples", "constant"), false);
  assert.equal(constantCohortApplies("aggregate", "available"), false);
});

test("mixed display descriptions count individual trajectories and summaries separately", () => {
  assert.equal(mixedTrendDisplayLabel([{ displayMode: "samples" }, { displayMode: "aggregate" }], "median"), "1 individual trajectory + 1 median summary");
  assert.equal(mixedTrendDisplayLabel([{ displayMode: "samples" }, { displayMode: "samples" }, { displayMode: "aggregate" }, { displayMode: "aggregate" }], "mean"), "2 individual trajectories + 2 mean summaries");
});

test("restored overrides validate IDs, boolean values and bounded size", () => {
  assert.equal(validTrendAggregationOverrides({ a: false, s2: true }), true);
  for (const value of [null, [], { a: "false" }, { invalid: true }, { s9999999: false }, Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`s${i}`, true]))]) {
    assert.equal(validTrendAggregationOverrides(value), false);
  }
});

test("figure manifests and CSV retain per-series display modes and exact contributors", () => {
  const point = (sampleUid: string, value: number) => ({ x: 10, y: value, n: 1, min: value, max: value,
    intervalLow: value, intervalHigh: value, intervalLabel: "single value" as const,
    members: [{ sampleUid, observationId: sampleUid, sampleLabel: sampleUid, sampleReference: "", value }] });
  const series: TrendSeries[] = [
    { id: "a::cell1", label: "Individual EVA", color: "red", displayMode: "samples", points: [point("EVA1", 40)] },
    { id: "s2::group:batch3", label: "TF4 median", color: "blue", displayMode: "aggregate", points: [{ ...point("TF4A", 80), y: 70, min: 60, max: 80, n: 2, intervalLabel: "individual values", members: [...point("TF4A", 80).members, ...point("TF4B", 60).members] }] },
  ];
  const manifest = figureManifest({ kind: "trend", title: "Mixed", caption: "Individual EVA + TF4 median", series,
    context: { aggregation: { method: "median", bySeries: { a: "none", s2: "median" } }, analyticalTrendSeries: series },
    xUnit: "days", yUnit: "%", analyticLimit: { maximumX: null, interpolation: "none" },
    viewport: { xMin: 0, xMax: 10, yMin: 0, yMax: 100 }, intervalsVisible: true, display: {},
  });
  assert.deepEqual(manifest.actualContributors, ["EVA1", "TF4A", "TF4B"]);
  assert.equal((manifest.series[0] as TrendSeries).displayMode, "samples");
  const csv = figureCsv(manifest);
  assert.match(csv, /"display_mode"/);
  assert.match(csv, /"samples"/);
  assert.match(csv, /"aggregate"/);
  assert.match(csv, /""bySeries"":\{""a"":""none"",""s2"":""median""\}/);
});
