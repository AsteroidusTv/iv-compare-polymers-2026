import assert from "node:assert/strict";
import test from "node:test";

import { describeGraphElectrode, describeSeriesSelection, describeTrendElectrodes, legendElectrodesByKey, legendSelectionsByKey, pointsThrough, showTrendMarkers, trendExportScaleWarning, uniqueLegendEntries } from "../app/lib/chart-export";
import { reportInkColor } from "../app/lib/report-svg";

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

test("graph exports name every contributing electrode when an aggregate mixes them", () => {
  assert.equal(describeGraphElectrode(["Cu", "Cu"]), undefined);
  assert.equal(describeGraphElectrode(["Ag"]), "Électrode Ag");
  assert.equal(describeGraphElectrode(["Cu", " Ag "]), "Électrodes Ag / Cu");
  assert.equal(describeGraphElectrode(["Cu", "Ag", "Carbon"]), "Électrodes Ag / Carbon / Cu");
  assert.equal(describeGraphElectrode(["Cu", null]), "Électrodes Cu / non renseignée");
  const electrodes = new Map([["copper", "Cu"], ["silver", "Ag"]]);
  const points = [{ x: 100, members: [{ sampleUid: "copper" }] }, { x: 200, members: [{ sampleUid: "silver" }] }];
  assert.equal(describeTrendElectrodes(points, electrodes), "Électrodes Ag / Cu");
  assert.equal(describeTrendElectrodes(pointsThrough(points, 100), electrodes), undefined);
  const individualSeries = points.map((point) => ({ label: `silicone-${point.x}`, exportLegendKey: "silicone", points: [point] }));
  assert.equal(legendElectrodesByKey(individualSeries, electrodes).get("silicone"), "Électrodes Ag / Cu");
  assert.equal(legendElectrodesByKey(individualSeries.map((item) => ({ ...item, points: pointsThrough(item.points, 100) })), electrodes).get("silicone"), undefined);
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
  assert.equal(describeSeriesSelection(points), "Échantillon individuel");
  assert.equal(describeSeriesSelection([{ n: 1, selectedLabel: "Cell 1" }, { n: 1, selectedLabel: "Cell 2" }]), "2 échantillons individuels");
});

test("shared material legend counts distinct individual specimens", () => {
  const series = [
    { label: "POE-2 / TF4", exportLegendKey: "tf4", points: [{ n: 1, selectedLabel: "Cell 3 · Ref 2" }] },
    { label: "POE-2 / TF4", exportLegendKey: "tf4", points: [{ n: 1, selectedLabel: "Cell 4 · Ref 2" }] },
    { label: "EVA", exportLegendKey: "eva", points: [{ n: 3 }] },
  ];
  assert.deepEqual([...legendSelectionsByKey(series)], [["tf4", "2 échantillons individuels"], ["eva", "n = 3"]]);
});

test("aggregate legends report the contributing N or its time-varying range", () => {
  assert.equal(describeSeriesSelection([{ n: 3 }, { n: 3 }]), "n = 3");
  assert.equal(describeSeriesSelection([{ n: 2 }, { n: 4 }]), "n = 2–4");
});

test("mixed exports describe each series without a redundant global subtitle", () => {
  assert.equal(describeSeriesSelection([{ n: 1, selectedLabel: "Cell 1 · Ref A" }, { n: 3 }]), "Échantillon individuel · agrégat n = 3");
  assert.equal(trendExportScaleWarning(false, true), "");
  assert.equal(trendExportScaleWarning(false, false), "");
  assert.equal(trendExportScaleWarning(true, false), "Valeurs hors de l’axe vertical");
  assert.equal(trendExportScaleWarning(true, true), "Valeurs ou intervalles hors de l’axe vertical");
});

test("report preset mutes known material colours without altering unknown colours", () => {
  assert.equal(reportInkColor("#0072B2"), "#365f80");
  assert.equal(reportInkColor("#7F3C8D"), "#674771");
  assert.equal(reportInkColor("#009E73"), "#376f5b");
  assert.equal(reportInkColor("white"), "white");
});
