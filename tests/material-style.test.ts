import assert from "node:assert/strict";
import test from "node:test";
import { aggregateSeriesMarkers, evaFormulationStyle, markerPath, materialStyle } from "../app/lib/material-style";

test("EVA formulations share orange but have distinctly solid and dashed aggregate lines", () => {
  assert.deepEqual(evaFormulationStyle("EVA", ["EVA 406", "EVA 406"]), { label: "EVA 406", linePattern: "" });
  assert.deepEqual(evaFormulationStyle("EVA", ["EVA 806"]), { label: "EVA 806", linePattern: "14 7" });
  assert.equal(materialStyle("EVA").color, "#D55E00");
});

test("mixed or unknown formulations and other materials retain existing styling", () => {
  for (const values of [["EVA 406", "EVA 806"], [null], [], ["EVA 400"], ["EVA 406", null]]) {
    assert.equal(evaFormulationStyle("EVA", values), null);
  }
  assert.equal(evaFormulationStyle("POE-2 / TF4", ["EVA 806"]), null);
});

test("same-family aggregate symbols are distinct and stable on reorder", () => {
  const series = ["c", "a", "b"].map(id => ({ id, config: { material: "Silicone / PDMS" }, marker: "circle" as const }));
  const styled = aggregateSeriesMarkers(series);
  assert.equal(new Set(styled.map(item => item.marker)).size, 3);
  assert.deepEqual(styled, aggregateSeriesMarkers([...series].reverse()).reverse());
  assert.deepEqual(series.map(item => item.marker), ["circle", "circle", "circle"]);
  assert.notEqual(markerPath(styled[0].marker, 0, 0, 3), markerPath(styled[1].marker, 0, 0, 3));
  assert.equal(aggregateSeriesMarkers([series[0]])[0].marker, "circle");
});
