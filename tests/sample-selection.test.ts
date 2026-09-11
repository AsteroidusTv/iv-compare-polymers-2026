import assert from "node:assert/strict";
import test from "node:test";

import { resolveSelectedSampleIds, toggleSelectedSampleId } from "../app/lib/sample-selection";

test("sample filters default to all available samples", () => {
  assert.deepEqual(resolveSelectedSampleIds(["one", "two", "three"]), ["one", "two", "three"]);
});

test("sample filters preserve a selected subset and ignore unavailable samples", () => {
  assert.deepEqual(resolveSelectedSampleIds(["one", "two", "three"], ["three", "missing", "one"]), ["one", "three"]);
  assert.deepEqual(resolveSelectedSampleIds(["new"], ["missing"]), ["new"]);
});

test("sample toggles support subsets, restore all, and keep at least one sample", () => {
  const available = ["one", "two", "three"];
  const withoutTwo = toggleSelectedSampleId(available, undefined, "two");

  assert.deepEqual(withoutTwo, ["one", "three"]);
  assert.equal(toggleSelectedSampleId(available, withoutTwo, "two"), undefined);
  assert.deepEqual(toggleSelectedSampleId(available, ["one"], "one"), ["one"]);
});
