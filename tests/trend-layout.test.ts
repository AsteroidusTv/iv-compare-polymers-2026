import assert from "node:assert/strict";
import test from "node:test";
import { arrangeTrendPanels } from "../app/lib/trend-layout";
import type { SeriesConfig } from "../app/lib/comparison";

function series(id: string, material: string, metric: SeriesConfig["metric"], stress = "Light ageing", xUnit = "h", yUnit = "% of reference") {
  return { id: `${id}::cell`, parentSeriesId: id, config: { id, material, metric, stress, electrode: "all", recipe: "all" }, xUnit, yUnit };
}
const selections = [
  series("a", "POE", "light_pout_reverse_mW_cm2"), series("b", "TPO", "light_pout_reverse_mW_cm2"),
  series("c", "POE", "light_pout_forward_mW_cm2"), series("d", "TPO", "light_pout_forward_mW_cm2"),
];

test("four Pearl comparison cards become two graphs by sweep metric", () => {
  const panels = arrangeTrendPanels(selections, "metric");
  assert.deepEqual(panels.map(panel => panel.series.map(item => item.config.id)), [["a", "b"], ["c", "d"]]);
  assert.equal(panels[0].series[0], selections[0]);
});
test("material layout compares sweep directions within POE and TPO", () => {
  assert.deepEqual(arrangeTrendPanels(selections, "material").map(panel => panel.series.map(item => item.config.id)), [["a", "c"], ["b", "d"]]);
});
test("series layout keeps the cells of each comparison card together", () => {
  const input = [...selections, { ...selections[0], id: "a::second-cell" }];
  const panels = arrangeTrendPanels(input, "series");
  assert.equal(panels.length, 4);
  assert.deepEqual(panels[0].series.map(item => item.id), ["a::cell", "a::second-cell"]);
});
test("protocols and incompatible metrics or units remain separate in every layout", () => {
  const input = [series("a", "POE", "efficiency_pct", "DH"), series("b", "POE", "ff_pct", "DH"),
    series("c", "POE", "efficiency_pct", "TC", "cycles"), series("d", "POE", "efficiency_pct", "DH", "h", "%")];
  for (const layout of ["metric", "material", "series"] as const) assert.equal(arrangeTrendPanels(input, layout).length, 4);
});
test("empty selection is empty and panel keys persist when a sibling cell is removed", () => {
  assert.deepEqual(arrangeTrendPanels([], "metric"), []);
  assert.equal(arrangeTrendPanels(selections, "metric")[0].key, arrangeTrendPanels(selections.slice(1), "metric")[0].key);
});
