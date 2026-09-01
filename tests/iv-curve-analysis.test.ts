import assert from "node:assert/strict";
import test from "node:test";

import { analyzeIVCurve } from "../app/lib/iv-curve-analysis";

test("IV analysis keeps acquisition order and selects the segment crossing Voc", () => {
  const points = [
    { x: -0.1, y: -20 }, { x: 0, y: -20 }, { x: 0.5, y: -15 }, { x: 1, y: 0 },
    { x: -10, y: 3 }, { x: -9.5, y: 2 },
  ];
  const result = analyzeIVCurve(points, 1);
  assert.equal(result.segments.length, 2);
  assert.equal(result.primaryPointCount, 4);
  assert.deepEqual(result.segments[result.primaryIndex].points.map((point) => point.sourceIndex), [0, 1, 2, 3]);
});
