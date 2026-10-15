import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import zlib from "node:zlib";
import { materialLabel } from "../app/lib/public-labels";
import { figureBatchLabel, figureFormulationLabel, figureSpecimenLabel } from "../app/lib/figure-language";
import { figureGroupLabels } from "../app/lib/figure-legend";
import { analysisGroups } from "../app/lib/cohort";
import { individualTrendPresentation, materialStyle } from "../app/lib/material-style";
import { uniqueLegendEntries } from "../app/lib/chart-export";
import { encapsulationDisplayLabels } from "../app/lib/encapsulation";
import type { IVDataset, Sample } from "../app/lib/iv-data";

const sample = (id: string, batch: string | null, extras: Partial<Sample> = {}): Sample => ({
  sample_uid: `SMP-${id}`, material_family: "TPO-2 / Lenzing", material_raw: "TPO Lenzing",
  batch_no_raw: batch, sample_id_raw: `${id}_R23`, electrode: "Cu", recipe_uid: "recorded-process", ...extras,
});

test("all five manufacturer labels are shortened without changing unknown names or colour keys", () => {
  for (const [raw, short] of [["POE-1 / Mitsui", "POE-1"], ["POE-2 / TF4", "POE-2"], ["POE-3 / Cybrid T22", "POE-3"], ["TPO-1 / DNP-CVF", "TPO-1"], ["TPO-2 / Lenzing", "TPO-2"]]) {
    const style = materialStyle(raw);
    assert.equal(materialLabel(raw), short);
    assert.equal(materialLabel(`A · ${raw} — lot 4`), `A · ${short} — lot 4`);
    assert.deepEqual(materialStyle(raw), style);
  }
  assert.equal(materialLabel("Silicone / PDMS"), "Silicone / PDMS");
  assert.equal(materialLabel("Custom / additive"), "Custom / additive");
});

test("publication labels for every packaged cell omit supplier wording", () => {
  const dataset: IVDataset = JSON.parse(zlib.gunzipSync(fs.readFileSync("public/data/iv-compare-dowsil.ivpack")).toString());
  for (const cell of dataset.samples) {
    assert.doesNotMatch(figureFormulationLabel(cell), /Mitsui|TF4|Cybrid|DNP|CVF|Lenzing/i);
  }
});

test("TPO-2 legend identifies real lots 4 and TPO_SL rather than subgroup numbers", () => {
  const samples = [sample("1", "#4"), sample("2", "TPO_SL")];
  const before = JSON.stringify(samples);
  const groups = analysisGroups(samples, "batch");
  const labels = figureGroupLabels(groups);
  assert.deepEqual([...labels.values()].sort(), ["TPO-2 — lot 4", "TPO-2 — lot TPO_SL"]);
  assert.equal(JSON.stringify(samples), before);
  assert.equal(groups.length, 2);
  assert.ok(groups.every(group => group.key.includes("TPO-2 / Lenzing")));
  const ribbonLabels = figureGroupLabels(groups, true);
  assert.ok([...ribbonLabels.values()].every(label => /lot (4|TPO_SL) · Ruban standard/.test(label)));
  assert.ok([...ribbonLabels.values()].every(label => !/sous-groupe|groupe \d/.test(label)));
});

test("actual pooled lots and missing batch metadata are explicit and labels never conflate S3 with 3", () => {
  assert.equal(figureBatchLabel(["#3", "S3", "A1", "#3"]), "lots 3, A1, S3");
  assert.equal(figureBatchLabel([null]), "lot non renseigné");
  assert.equal(figureBatchLabel(["#4", null]), "lots 4, non renseigné");
  const groups = analysisGroups([sample("1", "#4"), sample("2", "TPO_SL")], "material");
  assert.equal(groups.length, 1);
  assert.equal(figureGroupLabels(groups).get(groups[0].key), "TPO-2 — lots 4, TPO_SL");
});

test("distinct groups within the same lot retain explicit electrode or cell distinctions", () => {
  const electrodes = analysisGroups([sample("1", "#4", { electrode: "Ag" }), sample("2", "#4")]);
  assert.deepEqual([...figureGroupLabels(electrodes).values()].sort(), ["TPO-2 — lot 4 · électrode Ag", "TPO-2 — lot 4 · électrode Cu"]);
  const missingRecipes = analysisGroups([sample("1", "#4", { recipe_uid: null }), sample("2", "#4", { recipe_uid: null })]);
  const labels = [...figureGroupLabels(missingRecipes).values()];
  assert.equal(new Set(labels).size, 2);
  assert.ok(labels.some(label => label.endsWith("cellule 1")));
  assert.ok(labels.some(label => label.endsWith("cellule 2")));
});

test("individual export legends retain separate batches and short material names", () => {
  const series = [sample("1", "#4"), sample("2", "TPO_SL"), sample("3", "#4")].map(cell => ({
    label: figureSpecimenLabel(cell), ...individualTrendPresentation(cell.material_family, cell.material_raw, "a", cell.sample_uid, cell.batch_no_raw),
  }));
  assert.deepEqual(uniqueLegendEntries(series).map(item => item.exportLabel), ["TPO-2 — lot 4", "TPO-2 — lot TPO_SL"]);
  assert.equal(series[0].label, "TPO-2 — lot 4 · cellule 1");
});

test("process distinctions use recorded conditions, not numbered equipment subgroups", () => {
  const groups = [{ key: "one", material: "TPO", batch: "#4", electrode: "Cu", recipeUid: "r1" },
    { key: "two", material: "TPO", batch: "#4", electrode: "Cu", recipeUid: "r2" }];
  const labels = encapsulationDisplayLabels(groups, [{ recipe_uid: "r1", laminator: "Small laminator", temperature_profile_C: 140 },
    { recipe_uid: "r2", laminator: "Small laminator", temperature_profile_C: 150 }]);
  assert.deepEqual([...labels.values()], ["Petite lamineuse · 140 °C", "Petite lamineuse · 150 °C"]);
});
