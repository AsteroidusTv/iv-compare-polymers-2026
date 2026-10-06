import assert from "node:assert/strict";
import test from "node:test";
import { analysisGroups, baselineDiagnostic, cohortTimeline, constantCohort, laboratoryRetention, missingnessStatus } from "../app/lib/cohort";
import { materialStyle } from "../app/lib/material-style";
import { summarise } from "../app/lib/science";

const eva = [
  ...["A", "B"].map((sampleUid) => ({ time: 20, sampleUid, value: 100, batch: "A1" })),
  ...["A", "B", "C", "D", "E"].map((sampleUid) => ({ time: 50, sampleUid, value: ["A", "B"].includes(sampleUid) ? 90 : 0, batch: "A1" })),
  ...["A", "B"].map((sampleUid) => ({ time: 100, sampleUid, value: 85, batch: "A1" })),
];

test("EVA-like variable cohort warns of apparent recovery without declaring missing cells dead", () => {
  const timeline = cohortTimeline(eva, "mean");
  assert.deepEqual(timeline.map((p) => p.n), [2, 5, 2]);
  assert.deepEqual(timeline[2].left, ["C", "D", "E"]);
  assert.equal(timeline[2].apparentRecoveryRisk, true);
  assert.equal(timeline[1].summary.value, 36);
  assert.deepEqual(constantCohort(eva, { start: 20, end: 100 }).sampleUids, ["A", "B"]);
  assert.equal(missingnessStatus({ observationExists: false, numericValue: false, qaExcluded: false }), "unknown");
  assert.equal(missingnessStatus({ observationExists: true, numericValue: true, qaExcluded: false }), "observed");
});

test("normalise each specimen before averaging, never ratio of group means", () => {
  const retained = [laboratoryRetention(5, 10)!, laboratoryRetention(20, 20)!];
  assert.equal(summarise(retained, "mean").value, 75);
  assert.ok(Math.abs(100 * 25 / 30 - 83.333333) < 0.00001);
  assert.equal(laboratoryRetention(0, 10), 0);
  assert.equal(laboratoryRetention(10, 0), null);
  assert.equal(baselineDiagnostic(0), "zero");
  assert.equal(baselineDiagnostic(null), "missing");
  assert.equal(baselineDiagnostic(0.3, 1), "low");
});

test("conservative grouping separates formulations, batches, recipes and undocumented provenance", () => {
  const a = { sample_uid: "a", material_family: "EVA", material_raw: "406", batch_no_raw: "A1", recipe_uid: "R", electrode: "Cu" };
  const samples = [a, { ...a, sample_uid: "b", material_raw: "806" }, { ...a, sample_uid: "c", batch_no_raw: "A2" }];
  assert.equal(analysisGroups(samples).length, 3);
  assert.equal(analysisGroups(samples, "material").length, 1);
  assert.equal(analysisGroups([{ ...a, recipe_uid: undefined }, { ...a, sample_uid: "b", recipe_uid: undefined }]).length, 2);
  assert.throws(() => cohortTimeline([eva[0], eva[0]]), /duplicate/);
});

test("ribbon separation is opt-in and treats standard notes as one type", () => {
  const base = { material_family: "TPO", material_raw: "TPO-2", batch_no_raw: "A3", recipe_uid: "R", electrode: "Cu" };
  const samples = [
    { ...base, sample_uid: "a", ribbon_raw: "3M-3011" },
    { ...base, sample_uid: "b", ribbon_raw: "3M-3012" },
    { ...base, sample_uid: "c", ribbon_raw: null },
    { ...base, sample_uid: "d", ribbon_raw: "stand" },
    { ...base, sample_uid: "e", ribbon_raw: "too short" },
  ];
  assert.equal(analysisGroups(samples).length, 1);
  const separated = analysisGroups(samples, "conservative", false, true);
  assert.equal(separated.length, 3);
  assert.deepEqual(separated.map((group) => group.samples.map((sample) => sample.sample_uid).sort()).sort((left, right) => left[0].localeCompare(right[0])), [["a"], ["b"], ["c", "d", "e"]]);
  assert.equal(analysisGroups(samples, "material", false, true).length, 3);
});

test("material style is independent of selection order and mutable callers", () => {
  const a = materialStyle("EVA");
  materialStyle("POE-2 / TF4");
  assert.deepEqual(materialStyle("EVA"), a);
  a.color = "red";
  assert.notEqual(materialStyle("EVA").color, "red");
  assert.deepEqual(materialStyle("future formulation"), materialStyle("future formulation"));
});
