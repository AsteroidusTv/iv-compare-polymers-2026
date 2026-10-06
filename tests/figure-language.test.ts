import assert from "node:assert/strict";
import test from "node:test";

import { figureAgeingContext, figureMetricLabel, figureStageLabel, figureTimeUnit, figureXAxisLabel } from "../app/lib/figure-language";

test("figure wording uses French prose but keeps English protocol names", () => {
  assert.equal(figureMetricLabel("efficiency_pct"), "PCE");
  assert.equal(figureMetricLabel("outdoor_pr_pct"), "PR (médiane journalière)");
  assert.equal(figureAgeingContext("DH"), "pendant l’essai de damp heat (DH)");
  assert.equal(figureAgeingContext("TC"), "pendant l’essai de thermal cycling (TC)");
  assert.equal(figureAgeingContext("DH+TC"), "pendant les essais de damp heat et de thermal cycling (DH+TC)");
  assert.equal(figureAgeingContext("Outdoor"), "en exposition extérieure");
  assert.equal(figureAgeingContext("Light ageing"), "pendant le vieillissement sous lumière");
  assert.equal(figureTimeUnit("days"), "jours");
  assert.equal(figureTimeUnit("h"), "h");
  assert.equal(figureXAxisLabel("cycles"), "Nombre de cycles");
  assert.equal(figureXAxisLabel("h"), "Temps (h)");
  assert.equal(figureXAxisLabel("days"), "Temps (jours)");
  assert.equal(figureStageLabel("before"), "Avant");
  assert.equal(figureStageLabel("aged"), "Vieilli");
});
