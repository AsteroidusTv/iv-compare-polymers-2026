import assert from "node:assert/strict";
import test from "node:test";
import { ALL_RIBBONS, UNKNOWN_RIBBON, matchesRibbon, recordedRibbon, ribbonChoice, ribbonOptions, ribbonSelectionLabel } from "../app/lib/ribbon";

test("ribbon filter preserves raw recorded labels and distinguishes missing metadata", () => {
  const samples = [{ ribbon_raw: " 3M-3012 " }, { ribbon_raw: "3M-3011" }, { ribbon_raw: null }, { ribbon_raw: " " }];
  assert.deepEqual(ribbonOptions(samples), ["3M-3011", "3M-3012"]);
  assert.equal(recordedRibbon(samples[0]), "3M-3012");
  assert.equal(matchesRibbon(samples[0], ribbonChoice("3M-3012")), true);
  assert.equal(matchesRibbon(samples[1], ribbonChoice("3M-3012")), false);
  assert.equal(matchesRibbon(samples[2], UNKNOWN_RIBBON), true);
  assert.equal(matchesRibbon(samples[3], UNKNOWN_RIBBON), true);
  assert.ok(samples.every((sample) => matchesRibbon(sample, ALL_RIBBONS)));
});

test("recorded labels cannot collide with the all or unknown choices", () => {
  for (const value of ["all", "unknown", "recorded:3M-3011"]) {
    const sample = { ribbon_raw: value };
    assert.equal(matchesRibbon(sample, ribbonChoice(value)), true);
    assert.equal(ribbonSelectionLabel(ribbonChoice(value)), `Ruban ${value}`);
    assert.equal(matchesRibbon(sample, UNKNOWN_RIBBON), false);
  }
});
