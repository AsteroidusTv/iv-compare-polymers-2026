import assert from "node:assert/strict";
import test from "node:test";

import { figureAgeingContext, figureMetricLabel, figureStageLabel, figureTimeUnit } from "../app/lib/figure-language";

test("figure wording is French while scientific acronyms remain unchanged", () => {
  assert.equal(figureMetricLabel("efficiency_pct"), "PCE");
  assert.equal(figureMetricLabel("outdoor_pr_pct"), "PR (médiane journalière)");
  assert.equal(figureAgeingContext("DH"), "sous chaleur humide (DH)");
  assert.equal(figureAgeingContext("Outdoor"), "en exposition extérieure");
  assert.equal(figureTimeUnit("days"), "jours");
  assert.equal(figureTimeUnit("h"), "h");
  assert.equal(figureStageLabel("before"), "Avant");
  assert.equal(figureStageLabel("aged"), "Vieilli");
});
