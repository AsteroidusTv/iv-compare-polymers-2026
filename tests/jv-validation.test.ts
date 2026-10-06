import test from "node:test";
import assert from "node:assert/strict";
import { metricConsistency, evidenceValidated, JV_CONSISTENCY_RULES, type JVMetric } from "../app/lib/jv-validation";

test("all five metrics have explicit severe mismatch and physical screening", () => {
  for (const metric of Object.keys(JV_CONSISTENCY_RULES).filter(key => key !== "version") as JVMetric[]) {
    const value = metric === "voc_V" ? 1 : 20;
    assert.equal(metricConsistency(metric, value, value).status, "numerically_consistent");
    assert.notEqual(metricConsistency(metric, value, value * 2).status, "numerically_consistent");
    assert.equal(metricConsistency(metric, value, null).status, "unavailable");
    assert.equal(metricConsistency(metric, value, -1).status, "physically_inconsistent");
  }
  assert.equal(metricConsistency("ff_pct", 80, 106).status, "physically_inconsistent");
  assert.equal(metricConsistency("efficiency_pct", 20, 40).status, "severe_mismatch");
});
test("a validated string alone is not an adjudication with evidence", () => {
  assert.equal(evidenceValidated(undefined, "M1"), false);
  assert.equal(evidenceValidated({status:"validated", measurement_uid:"M1", source:"", reason:"", version:""}, "M1"), false);
});
