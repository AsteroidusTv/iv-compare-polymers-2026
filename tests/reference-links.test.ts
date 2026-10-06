import test from "node:test";
import assert from "node:assert/strict";
import { referenceLinkDiagnostic } from "../app/lib/reference-links.mjs";
const file = { file_name: "C1-R13.xls", source_file: "260803 - Orange box/C1-R13.xls" };
const sample = { sample_uid: "S1", source_inventory_sheet: "Lami-results2", batch_no_raw: "A1", sample_id_raw: "CVF1_R13" };
test("Orange reference requires a correct explicit R and unique inventory candidate", () => {
  assert.equal(referenceLinkDiagnostic(file, [sample]).sampleUid, "S1");
  assert.equal(referenceLinkDiagnostic({...file, file_name:"C1-R14.xls"}, [sample]).reason, "contradictory_R_reference");
  assert.equal(referenceLinkDiagnostic({...file, file_name:"C1.xls"}, [sample]).reason, "missing_or_malformed_R_reference");
  assert.equal(referenceLinkDiagnostic(file, [sample, {...sample, sample_uid:"S2"}]).reason, "multiple_candidates");
  assert.equal(referenceLinkDiagnostic(file, []).reason, "no_candidate");
});
