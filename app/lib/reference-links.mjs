// Migrated from the existing audited mapping; not a new laboratory adjudication.
export const ORANGE_BOX_SAMPLE_IDS = new Map([
  [1, "CVF1_R13"], [2, "CVF2_R14"], [3, "Len1_R24"], [4, "Len2_R7"],
  [5, "Len3_R21"], [6, "Len4_R20"], [7, "Len5_R11"], [8, "Len6_R5"],
  [9, "CVF3_R10"], [10, "CVF4_R16"], [11, "CVF5_R15"], [12, "TF4_1_R22"],
]);

/** @param {{file_name?: string|null, source_file?: string|null}} file
 * @param {Array<{sample_uid: string, source_inventory_sheet?: string|null, batch_no_raw?: string|null, sample_id_raw?: string|null}>} samples */
export function referenceLinkDiagnostic(file, samples) {
  const source = String(file.source_file ?? "");
  const orange = source.includes("260803 - Orange box");
  const flag = source.includes("260826 - Flag box") && !source.includes("/Trash/");
  const unresolved = (reason, candidates = []) => ({ status: "unresolved", reason, candidates, sampleUid: null, basis: null });
  if (!orange && !flag) return { ...unresolved("not_reference_source"), status: "not_applicable" };
  const match = String(file.file_name ?? "").match(/^C(\d+)\s*-\s*R(\d+)\.xls$/i);
  if (!match) return unresolved("missing_or_malformed_R_reference");
  const reference = Number(match[2]);
  let candidates;
  if (orange) {
    const expected = ORANGE_BOX_SAMPLE_IDS.get(Number(match[1]));
    if (!expected) return unresolved("unknown_orange_cell");
    const expectedR = Number(expected.match(/_R(\d+)$/i)?.[1]);
    if (reference !== expectedR) return unresolved("contradictory_R_reference");
    candidates = samples.filter(sample => sample.source_inventory_sheet === "Lami-results2" && sample.batch_no_raw === "A1" && sample.sample_id_raw === expected);
  } else candidates = samples.filter(sample => sample.source_inventory_sheet === "Lami-results2" && ["A2", "A3"].includes(sample.batch_no_raw ?? "") && Number(String(sample.sample_id_raw ?? "").match(/_R(\d+)$/i)?.[1]) === reference);
  if (candidates.length !== 1) return unresolved(candidates.length ? "multiple_candidates" : "no_candidate", candidates.map(sample => sample.sample_uid));
  return { status: "matched", reason: "unique_cell_and_R_reference", candidates: candidates.map(sample => sample.sample_uid), sampleUid: candidates[0].sample_uid, basis: orange ? "Orange box cell + R-reference" : "Flag box unique R-reference" };
}
