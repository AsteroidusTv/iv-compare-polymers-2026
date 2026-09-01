import assert from "node:assert/strict";
import test from "node:test";

import { createInitialSeries } from "../app/lib/comparison";
import type { IVDataset } from "../app/lib/iv-data";

test("initial comparison aligns the shared electrode instead of mixing conditions", () => {
  const dataset = {
    samples: [
      { sample_uid: "A-CU", material_family: "POE-1 / Mitsui", electrode: "Cu" },
      { sample_uid: "A-AG", material_family: "POE-1 / Mitsui", electrode: "Ag" },
      { sample_uid: "B-CU", material_family: "POE-2 / TF4", electrode: "Cu" },
    ],
    observations: [
      { observation_uid: "OA", sample_uid: "A-CU", test_type: "DH", efficiency_pct: 10 },
      { observation_uid: "OB", sample_uid: "B-CU", test_type: "DH", efficiency_pct: 11 },
    ],
  } as IVDataset;
  const series = createInitialSeries(dataset);
  assert.deepEqual(series.map((item) => item.electrode), ["Cu", "Cu"]);
});
