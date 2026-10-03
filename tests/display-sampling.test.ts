import assert from "node:assert/strict";
import test from "node:test";
import { sampleDisplayPoints } from "../app/lib/display-sampling";

test("display spacing keeps actual irregular measurements and endpoints without modifying input", () => {
  const points = [0.15, 0.43, 0.7, 1.25, 1.52, 2.1, 2.4, 2.6].map((x, i) => ({ x, y: i }));
  assert.deepEqual(sampleDisplayPoints(points, 1).map(p => p.x), [0.15, 1.25, 2.4, 2.6]);
  assert.deepEqual(sampleDisplayPoints(points, 5), [points[0], points.at(-1)]);
  assert.deepEqual(sampleDisplayPoints(points, 0), points);
  assert.equal(points.length, 8);
  assert.equal(sampleDisplayPoints(points, 1)[1], points[3]);
  assert.deepEqual(sampleDisplayPoints([], 1), []);
});
