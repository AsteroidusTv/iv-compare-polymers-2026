export const REPEAT_RULES = { version: "1.0.0", minimumPoints: 10, minimumIndependentFiles: 3, voltageTolerance: 1e-6, normalizedCurrentTolerance: 5e-5 } as const;
type Point = { x: number; y: number };
export interface SegmentInput { id: string; file: string; points: Point[] }
export interface SegmentRepeat { independentFiles: number; detection: "none" | "exact" | "near" | "scaled" }

/** Compare aligned acquisition sequences without interpolation, shifting or smoothing. */
export function segmentSimilarity(a: Point[], b: Point[]): "exact" | "near" | "scaled" | null {
  if (a.length !== b.length || a.length < REPEAT_RULES.minimumPoints) return null;
  const aMax = Math.max(...a.map(p => Math.abs(p.y))), bMax = Math.max(...b.map(p => Math.abs(p.y)));
  if (!aMax || !bMax || !Number.isFinite(aMax) || !Number.isFinite(bMax)) return null;
  let exact = true;
  for (let i = 0; i < a.length; i++) {
    if (!Number.isFinite(a[i].x) || !Number.isFinite(b[i].x)) return null;
    if (Math.abs(a[i].x - b[i].x) > REPEAT_RULES.voltageTolerance || Math.abs(a[i].y / aMax - b[i].y / bMax) > REPEAT_RULES.normalizedCurrentTolerance) return null;
    if (a[i].x !== b[i].x || a[i].y !== b[i].y) exact = false;
  }
  return exact ? "exact" : Math.abs(aMax / bMax - 1) <= REPEAT_RULES.normalizedCurrentTolerance ? "near" : "scaled";
}

export function repeatedSegments(entries: SegmentInput[]): Map<string, SegmentRepeat> {
  const result = new Map(entries.map(entry => [entry.id, { independentFiles: 0, detection: "none" as SegmentRepeat["detection"] }]));
  // Collapse exact arrays before similarity comparisons: repeated sweeps do not
  // multiply either specimen weight or independent-file evidence.
  const exact = new Map<string, SegmentInput[]>();
  for (const entry of entries) {
    if (entry.points.length < REPEAT_RULES.minimumPoints) continue;
    const key = JSON.stringify(entry.points.map(p => [p.x, p.y]));
    const rows = exact.get(key) ?? []; rows.push(entry); exact.set(key, rows);
  }
  type Group = { representative: SegmentInput; entries: SegmentInput[]; detection: SegmentRepeat["detection"] };
  const buckets = new Map<string, Group[]>();
  const groups: Group[] = [];
  for (const [, rows] of [...exact].sort(([a], [b]) => a.localeCompare(b))) {
    const entry = rows[0];
    const amplitude = Math.max(...entry.points.map(p => Math.abs(p.y)));
    if (!amplitude || !Number.isFinite(amplitude)) continue;
    const probes = [0, Math.floor(entry.points.length / 2), entry.points.length - 1].map(i => Math.floor(entry.points[i].y / amplitude / REPEAT_RULES.normalizedCurrentTolerance));
    const key = (bins: number[]) => `${entry.points.length}:${bins.join(":")}`;
    const candidates: Group[] = [];
    // Adjacent probe bins prevent quantisation-boundary false negatives.
    for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) for (const c of [-1, 0, 1]) candidates.push(...(buckets.get(key([probes[0]+a, probes[1]+b, probes[2]+c])) ?? []));
    const match = candidates.find(group => segmentSimilarity(group.representative.points, entry.points) !== null);
    if (match) {
      const similarity = segmentSimilarity(match.representative.points, entry.points)!;
      match.entries.push(...rows);
      if (similarity === "scaled" || (similarity === "near" && match.detection !== "scaled")) match.detection = similarity;
    } else {
      const group: Group = { representative: entry, entries: [...rows], detection: "exact" };
      const bucket = buckets.get(key(probes)) ?? []; bucket.push(group); buckets.set(key(probes), bucket); groups.push(group);
    }
  }
  for (const group of groups) {
    const independentFiles = new Set(group.entries.map(entry => entry.file)).size;
    for (const entry of group.entries) result.set(entry.id, { independentFiles, detection: independentFiles >= REPEAT_RULES.minimumIndependentFiles ? group.detection : "none" });
  }
  return result;
}
