import assert from "node:assert/strict";
import test from "node:test";

import { figureAgeingContext, figureFormulationLabel, figureMetricLabel, figureStageLabel, figureTimeUnit, figureXAxisLabel, publicationText } from "../app/lib/figure-language";
import { pearlMetric } from "../app/lib/light-ageing-metrics";

test("light-ageing figures omit the mean qualifier while preserving analytical metric descriptions", () => {
  assert.equal(figureMetricLabel("light_pout_mean_mW_cm2"), "Pout");
  assert.equal(figureMetricLabel("light_pout_forward_mW_cm2"), "Pout (balayage avant)");
  assert.equal(figureMetricLabel("light_pout_reverse_mW_cm2"), "Pout (balayage arrière)");
  assert.equal(publicationText("Rétention de Pout (moyenne aller/retour) (% de la valeur initiale)"), "Rétention de Pout (% de la valeur initiale)");
  assert.match(pearlMetric("light_pout_mean_mW_cm2")!.figureLabel, /moyenne aller\/retour/);
});

test("figure formulations omit manufacturers but retain numbered formulations and genuine variants", () => {
  for (const [family, raw, label] of [["POE-1 / Mitsui", "Mitsui", "POE-1"], ["POE-2 / TF4", "TF4", "POE-2"], ["POE-3 / Cybrid T22", "Cybrid T22", "POE-3"], ["TPO-2 / Lenzing", "TPO Lenzing", "TPO-2"], ["TPO-1 / DNP-CVF", "TPO-1_CVF", "TPO-1"]]) {
    assert.equal(figureFormulationLabel({material_family:family,material_raw:raw}),label);
  }
  for (const variant of ["EVA 406", "EVA 806"]) assert.equal(figureFormulationLabel({material_family:"EVA",material_raw:variant}),variant);
  for (const recorded of ["Cybrid", "POE-3_Cybrid"]) assert.equal(figureFormulationLabel({material_family:"POE-3 / Cybrid T22",material_raw:recorded}),"POE-3");
  assert.equal(figureFormulationLabel({material_family:"Silicone / PDMS",material_raw:"Silicones, 5th"}),"PDMS");
  assert.equal(figureFormulationLabel({material_family:"POE-1 / Mitsui",material_raw:"experimental variant"}),"POE-1 / experimental variant");
});

test("figure wording uses French prose but keeps English protocol names", () => {
  assert.equal(figureMetricLabel("efficiency_pct"), "PCE");
  assert.equal(figureMetricLabel("outdoor_pr_pct"), "PR (médiane journalière)");
  assert.equal(figureAgeingContext("DH"), "pendant l’essai de Damp Heat (DH)");
  assert.equal(figureAgeingContext("TC"), "pendant l’essai de Thermal Cycling (TC)");
  assert.equal(figureAgeingContext("DH+TC"), "pendant les essais de Damp Heat et de Thermal Cycling (DH+TC)");
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
