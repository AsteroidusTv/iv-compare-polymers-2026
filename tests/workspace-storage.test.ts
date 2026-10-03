import assert from "node:assert/strict";
import test from "node:test";
import { readWorkspaceValue, sameValueShape, WORKSPACE_STORAGE_PREFIX, writeWorkspaceValue } from "../app/lib/workspace-storage";

test("workspace preferences round-trip separately under versioned keys", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const config = [{ id: "s2", material: "EVA", formulation: "EVA 806" }];
  writeWorkspaceValue(storage, "seriesConfigs", config);
  writeWorkspaceValue(storage, "mode", "absolute");
  assert.deepEqual(readWorkspaceValue(storage, "seriesConfigs", [], Array.isArray), config);
  assert.equal(readWorkspaceValue(storage, "mode", "retention", value => value === "absolute" || value === "retention"), "absolute");
  assert.ok(values.has(WORKSPACE_STORAGE_PREFIX + "seriesConfigs"));
});

test("missing, corrupt, oversized and invalid settings fall back without throwing", () => {
  for (const raw of [null, "{broken", '"invalid"', "0".repeat(100_001)]) {
    assert.equal(readWorkspaceValue({ getItem: () => raw }, "mode", "retention", value => value === "absolute"), "retention");
  }
  const denied = { getItem: () => { throw new Error("Denied"); }, setItem: () => { throw new Error("Quota"); } };
  assert.equal(readWorkspaceValue(denied, "key", false, value => typeof value === "boolean"), false);
  assert.doesNotThrow(() => writeWorkspaceValue(denied, "key", true));
});

test("shape validation rejects malformed nested preferences and non-finite numbers", () => {
  assert.equal(sameValueShape({ min: "40", max: "120" }, { min: "", max: "" }), true);
  assert.equal(sameValueShape({ min: 40, max: "120" }, { min: "", max: "" }), false);
  assert.equal(sameValueShape(Infinity, 0), false);
  assert.equal(sameValueShape([{}], []), false);
  assert.equal(sameValueShape(["group:a"], []), true);
  assert.equal(sameValueShape({ a: ["SMP-1"] }, {}), true);
  assert.equal(sameValueShape({ a: { unexpected: true } }, {}), false);
});
