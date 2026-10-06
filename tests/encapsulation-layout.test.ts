import assert from "node:assert/strict";
import test from "node:test";
import { pointOffsets } from "../app/lib/encapsulation-layout";

test("overlapping markers spread without changing their y coordinates", () => {
  const ys = Array(8).fill(100);
  const offsets = pointOffsets(ys);
  assert.equal(new Set(offsets).size, 8);
  assert.deepEqual(ys, Array(8).fill(100));
  assert.deepEqual(pointOffsets([10, 30, 50]), [0, 0, 0]);
  assert.ok(offsets.every((x) => Math.abs(x) <= 28));
  assert.deepEqual(pointOffsets(ys), offsets);
});
