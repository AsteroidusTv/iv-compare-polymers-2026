import test from "node:test";
import assert from "node:assert/strict";
import { figureCsv, figureManifest, jvMethodCaption } from "../app/lib/figure-export";
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
  assert.deepEqual(manifest.actualContributors,["S1"]);
  const hidden:TrendSeries={id:"hidden",label:"Hidden",color:"blue",points:[{...point(1000,70),members:[{...point(1000,70).members[0],sampleUid:"S2"}]}]};
  const hiddenManifest=figureManifest({...base,kind:"trend",series,context:{analyticalTrendSeries:[...series,hidden]}});
  assert.deepEqual(hiddenManifest.actualContributors,["S1","S2"]);
  assert.deepEqual(hiddenManifest.visibleContributors,["S1"]);
  assert.doesNotMatch(figureCsv(hiddenManifest), /S2/);
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
test("JV manifest records omitted source ranges and distinguishes them from unselected segments",()=>{
 const series:CurveSeries[]=[{id:"M",label:"Before",color:"blue",segments:[{id:"M-segment-1",isPrimary:true,points:[{x:.5,y:20,sourceIndex:1}]}]}];
 const context={validation:{quantitativeValidated:false},selectedSamples:[{sample_uid:"S",material_raw:"TF4",batch_no_raw:"A1"}],seriesMetadata:{M:{measurement:{measurement_uid:"M",sample_uid:"S"},file:{inferred_test_type:"DH",inferred_exposure_duration:305,measurement_date:"2026-06-04"},diagnostics:{analysis:{segments:[{id:"segment-1",points:[{sourceIndex:0},{sourceIndex:1},{sourceIndex:2}]},{id:"segment-2",points:[{sourceIndex:3}]}]}}}}};
 const manifest=figureManifest({...base,kind:"jv",series,context});
 assert.deepEqual(manifest.pointExclusions,[{seriesId:"M",segmentId:"segment-1",sourcePointIndices:[0,2],reason:"outside_selected_operating_range"},{seriesId:"M",segmentId:"segment-2",sourcePointIndices:[3],reason:"unselected_segment"}]);
 const caption=jvMethodCaption(context,series);
 assert.match(caption,/batch A1/);assert.match(caption,/305 h/);assert.match(caption,/inspection only/);
});
