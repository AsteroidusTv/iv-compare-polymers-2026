/** Display-only selection of recorded points, without averaging or changing their timestamps. */
export function sampleDisplayPoints<T extends { x: number }>(points: readonly T[], interval: number): T[] {
  if (!(interval > 0) || points.length < 3) return [...points];
  const ordered = [...points].sort((a, b) => a.x - b.x);
  const selected = [ordered[0]];
  for (const point of ordered.slice(1, -1)) {
    if (point.x - selected[selected.length - 1].x >= interval) selected.push(point);
  }
  selected.push(ordered[ordered.length - 1]);
  return selected;
}
