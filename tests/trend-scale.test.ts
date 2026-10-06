import test from "node:test";
import assert from "node:assert/strict";
import { trendDisplayValues, trendIntervalVisible } from "../app/lib/chart-export";
import { summarise } from "../app/lib/science";

function point(values: number[], method: "mean" | "median") {
  const summary = summarise(values, method);
  return { ...summary, y: summary.value, members: values.map(value => ({ value })) };
}
test("n=2 optional mean CI is untruncated and included in scale only when drawn", () => {
  const p = point([60,120], "mean");
  assert.equal(trendIntervalVisible(p, true), true);
  assert.ok(p.intervalHigh > 450);
  assert.equal(Math.max(...trendDisplayValues([p], true)), p.intervalHigh);
  assert.equal(Math.min(...trendDisplayValues([p], true)), p.intervalLow);
  assert.deepEqual(trendDisplayValues([p], false), [90,60,120]);
});
test("median scale includes every observed point, not just the IQR", () => {
  const p = point([0,80,90,100,120], "median");
  assert.equal(Math.min(...trendDisplayValues([p], true)), 0);
  assert.equal(Math.max(...trendDisplayValues([p], true)), 120);
  assert.equal(trendIntervalVisible(point([60,120], "median"), true), false);
  assert.equal(trendIntervalVisible(point([60], "mean"), true), false);
  assert.equal(trendIntervalVisible({...p,selectedLabel:"one specimen"}, true), false);
});
