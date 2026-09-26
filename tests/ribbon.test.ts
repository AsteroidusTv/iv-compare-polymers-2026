import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import type { IVDataset } from "../app/lib/iv-data";
import { ALL_RIBBONS, STANDARD_RIBBON, matchesRibbon, recordedRibbon, ribbonChoice, ribbonLabel, ribbonOptions, ribbonSelectionLabel } from "../app/lib/ribbon";

test("ribbon filter separates explicit references from standard and preparation notes", () => {
  const samples = [{ ribbon_raw: " 3M-3012 " }, { ribbon_raw: "3M-3011" }, { ribbon_raw: null }, { ribbon_raw: " " },
    { ribbon_raw: "stand" }, { ribbon_raw: "too short" }, { ribbon_raw: "facing down" }, { ribbon_raw: "all the length" }];
  assert.deepEqual(ribbonOptions(samples), ["3M-3011", "3M-3012"]);
  assert.equal(recordedRibbon(samples[0]), "3M-3012");
  assert.equal(matchesRibbon(samples[0], ribbonChoice("3M-3012")), true);
  assert.equal(matchesRibbon(samples[1], ribbonChoice("3M-3012")), false);
  assert.ok(samples.slice(2).every((sample) => matchesRibbon(sample, STANDARD_RIBBON)));
  assert.ok(samples.slice(2).every((sample) => recordedRibbon(sample) === null));
  assert.equal(ribbonSelectionLabel(STANDARD_RIBBON), "Ruban standard");
  assert.equal(ribbonLabel(null), "Ruban standard");
  assert.ok(samples.every((sample) => matchesRibbon(sample, ALL_RIBBONS)));
});

test("recorded references cannot collide with the all or standard choices", () => {
  for (const value of ["all", "unknown", "recorded:3M-3011"]) {
    const sample = { ribbon_raw: value };
    assert.equal(matchesRibbon(sample, ribbonChoice(value)), true);
    assert.equal(ribbonSelectionLabel(ribbonChoice(value)), `Ruban ${value}`);
    assert.equal(matchesRibbon(sample, STANDARD_RIBBON), false);
  }
});

test("current package offers only three explicit ribbon references and preserves raw notes", () => {
  const dataset = JSON.parse(gunzipSync(readFileSync("public/data/iv-compare-dowsil.ivpack")).toString()) as IVDataset;
  assert.deepEqual(ribbonOptions(dataset.samples), ["3M-3007", "3M-3011", "3M-3012"]);
  assert.equal(dataset.samples.filter((sample) => matchesRibbon(sample, STANDARD_RIBBON)).length, 119);
  assert.ok(dataset.samples.some((sample) => sample.ribbon_raw === "too short" && recordedRibbon(sample) === null));
});
